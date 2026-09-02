import type { PColumn, PTableDef, PTableDefV2 } from "@milaboratories/pl-model-common";
import { digestPFrameDef, digestPTableDef, digestPTableDefV2, type DefDigest } from "./digest";
import type { Recorder } from "./recorder";

/**
 * Wrappers for the seams the model layer passes through.
 *
 * Every operation writes a begin record and an end record. That pairing is what
 * makes a crash legible: when the process dies mid-operation the end record is
 * missing, so the log names the exact call that was running when memory ran out
 * — the question a post-crash report has to answer.
 *
 * The wrappers are structural rather than tied to one driver interface, because
 * the same three creation methods appear twice with different return types: the
 * model-facing driver hands back a bare handle, the internal one hands back a
 * pool entry.
 */

export type HandleOrigin = {
  /** Sequence number of the record holding the join digest. */
  seq: number;
  op: string;
  inputRowsMax?: number;
  digest?: DefDigest;
  observed?: { rows?: number; columns?: number };
};

export type HandleRegistry = {
  put(handle: string, origin: HandleOrigin): void;
  get(handle: string): HandleOrigin | undefined;
  observe(handle: string, observed: { rows?: number; columns?: number }): void;
};

export type ModelDriverLike<H> = {
  createPFrame(def: never): H;
  createPTable(def: never): H;
  createPTableV2(def: never): H;
};

export type RenderInfo = {
  blockId?: string;
  block?: string;
  blockVersion?: string;
  key?: string;
  argsHash?: string;
  /** Which lambda of the block's model is being rendered. */
  lambda?: string;
  /** Nth resumption of a deferred render, counted from one. */
  recalculation?: number;
  /** Read after the render, so sandbox counters cover the whole call. */
  getStats?: () => unknown;
  /** Any further context the call site wants on the record. */
  [key: string]: unknown;
};

/** Maps driver handles back to the join that produced them. */
export function createHandleRegistry(limit = 512): HandleRegistry {
  const map = new Map<string, HandleOrigin>();
  return {
    put(handle, origin) {
      if (map.size >= limit) {
        const oldest = map.keys().next();
        if (!oldest.done) map.delete(oldest.value);
      }
      map.set(handle, origin);
    },
    get(handle) {
      return map.get(handle);
    },
    observe(handle, observed) {
      const origin = map.get(handle);
      if (origin) origin.observed = observed;
    },
  };
}

/**
 * Wraps the driver that block models call to build frames and tables.
 *
 * Records the redacted join tree and its structural findings, then remembers
 * which handle came from which join so later data calls can be attributed back
 * to the definition that caused them.
 */
export function wrapModelDriver<D extends ModelDriverLike<unknown>>(
  driver: D,
  recorder: Recorder,
  registry: HandleRegistry,
  handleOf: (result: unknown) => string = defaultHandleOf,
): D {
  const wrapped = {
    createPFrame(def: readonly PColumn<unknown>[]) {
      return record(
        recorder,
        registry,
        handleOf,
        "createPFrame",
        () => digestPFrameDef(def),
        () => (driver.createPFrame as (d: unknown) => unknown)(def),
      );
    },
    createPTable(def: PTableDef<PColumn<unknown>>) {
      return record(
        recorder,
        registry,
        handleOf,
        "createPTable",
        () => digestPTableDef(def),
        () => (driver.createPTable as (d: unknown) => unknown)(def),
      );
    },
    createPTableV2(def: PTableDefV2<PColumn<unknown>>) {
      return record(
        recorder,
        registry,
        handleOf,
        "createPTableV2",
        () => digestPTableDefV2(def),
        () => (driver.createPTableV2 as (d: unknown) => unknown)(def),
      );
    },
  };
  // The three creation methods are replaced and everything else is inherited,
  // so the wrapper satisfies whichever driver interface the caller holds.
  return Object.assign(Object.create(driver as object) as D, wrapped);
}

/**
 * Wraps the asynchronous data-access driver.
 *
 * Adds the observed table shape, the size of what crossed back into JavaScript,
 * and the amplification between input and output rows — the empirical
 * counterpart to the structural findings taken from the join tree.
 */
export function wrapDataDriver<D extends object>(
  driver: D,
  recorder: Recorder,
  registry: HandleRegistry,
): D {
  const source = driver as unknown as {
    getShape(handle: string, ...rest: unknown[]): Promise<{ rows: number; columns: number }>;
    getData(
      handle: string,
      columnIndices: number[],
      range?: { offset: number; length: number },
      ...rest: unknown[]
    ): Promise<unknown[]>;
    calculateTableData(handle: string, request: unknown, ...rest: unknown[]): Promise<unknown[]>;
  };

  const wrapped = {
    async getShape(handle: string, ...rest: unknown[]) {
      const origin = registry.get(handle);
      return await span(
        recorder,
        "getShape",
        { handle: shortHandle(handle), joinSeq: origin?.seq },
        async () => {
          const shape = await source.getShape(handle, ...rest);
          registry.observe(handle, { rows: shape?.rows, columns: shape?.columns });
          return {
            result: shape,
            detail: {
              rows: shape?.rows,
              columns: shape?.columns,
              inputRowsMax: origin?.inputRowsMax,
              amplification: ratio(shape?.rows, origin?.inputRowsMax),
            },
          };
        },
      );
    },

    async getData(
      handle: string,
      columnIndices: number[],
      range?: { offset: number; length: number },
      ...rest: unknown[]
    ) {
      const origin = registry.get(handle);
      return await span(
        recorder,
        "getData",
        {
          handle: shortHandle(handle),
          joinSeq: origin?.seq,
          columnCount: columnIndices?.length,
          range: range ? { offset: range.offset, length: range.length } : null,
          // A fetch with no range pulls the whole table into the JS heap, which
          // on a large table is an out-of-memory condition by itself.
          unbounded: !range,
          tableRows: origin?.observed?.rows,
        },
        async () => {
          const data = await source.getData(handle, columnIndices, range, ...rest);
          return { result: data, detail: { returnedBytes: vectorsBytes(data) } };
        },
      );
    },

    async calculateTableData(handle: string, request: unknown, ...rest: unknown[]) {
      return await span(
        recorder,
        "calculateTableData",
        {
          handle: shortHandle(handle),
          def: digestPTableDef(request as PTableDef<PColumn<unknown>>),
        },
        async () => {
          const data = await source.calculateTableData(handle, request, ...rest);
          const vectors = (data ?? []).map((column) => (column as { data?: unknown })?.data);
          return {
            result: data,
            detail: { columns: data?.length, returnedBytes: vectorsBytes(vectors) },
          };
        },
      );
    },
  };

  return Object.assign(Object.create(driver) as D, wrapped);
}

/**
 * Records one block model render.
 *
 * `getStats` exposes the middle layer's own sandbox accounting, whose
 * serialisation byte counts show how much data the model moved across the
 * QuickJS boundary — the model-layer memory cost that no driver call reports.
 */
export async function recordModelRender<T>(
  recorder: Recorder | undefined,
  info: RenderInfo,
  fn: () => Promise<T>,
): Promise<T> {
  if (!recorder) return await fn();
  const { getStats, ...plain } = info;
  const begin = recorder.event("render-begin", { ...plain, mem: recorder.memorySnapshot() });
  const startedAt = performance.now();
  try {
    const result = await fn();
    recorder.event("render-end", {
      begin,
      ...plain,
      ms: round(performance.now() - startedAt),
      stats: getStats?.(),
      mem: recorder.memorySnapshot(),
    });
    return result;
  } catch (error) {
    recorder.event("render-error", {
      begin,
      ...plain,
      ms: round(performance.now() - startedAt),
      error: describeError(error),
      mem: recorder.memorySnapshot(),
    });
    throw error;
  }
}

/** Synchronous variant, for a render that is not driven by a promise. */
export function recordModelRenderSync<T>(
  recorder: Recorder | undefined,
  info: RenderInfo,
  fn: () => T,
): T {
  if (!recorder) return fn();
  const { getStats, ...plain } = info;
  const begin = recorder.event("render-begin", { ...plain, mem: recorder.memorySnapshot() });
  const startedAt = performance.now();
  try {
    const result = fn();
    recorder.event("render-end", {
      begin,
      ...plain,
      ms: round(performance.now() - startedAt),
      stats: getStats?.(),
      mem: recorder.memorySnapshot(),
    });
    return result;
  } catch (error) {
    recorder.event("render-error", {
      begin,
      ...plain,
      ms: round(performance.now() - startedAt),
      error: describeError(error),
      mem: recorder.memorySnapshot(),
    });
    throw error;
  }
}

// Internals

function record<R>(
  recorder: Recorder,
  registry: HandleRegistry,
  handleOf: (result: unknown) => string,
  op: string,
  digestFn: () => DefDigest,
  call: () => R,
): R {
  let digest: DefDigest | { digestFailed: string };
  try {
    digest = digestFn();
  } catch (error) {
    // Diagnostics must never be the reason a join fails to build.
    digest = { digestFailed: describeError(error) };
  }
  const findings = "findings" in digest ? digest.findings : undefined;
  // A creation call is synchronous but not free: it hands the definition to the
  // native engine, which can allocate. It gets a begin/end pair like any other
  // operation, so a death inside it is attributed to it and not to the render
  // around it.
  const seq = recorder.event(`${op}-begin`, {
    def: digest,
    findings,
    mem: recorder.memorySnapshot(),
  });
  const startedAt = performance.now();

  let result: R;
  try {
    result = call();
  } catch (error) {
    recorder.event(`${op}-error`, {
      begin: seq,
      ms: round(performance.now() - startedAt),
      error: describeError(error),
      mem: recorder.memorySnapshot(),
    });
    throw error;
  }

  const handle = handleOf(result);
  const tree = "tree" in digest ? digest.tree : undefined;
  registry.put(handle, {
    seq,
    op,
    inputRowsMax: tree?.inputRowsMax ?? ("inputRows" in digest ? digest.inputRows : undefined),
    digest: "kind" in digest ? digest : undefined,
  });
  recorder.event(`${op}-end`, {
    begin: seq,
    ms: round(performance.now() - startedAt),
    handle: shortHandle(handle),
    mem: recorder.memorySnapshot(),
  });
  return result;
}

async function span<T>(
  recorder: Recorder,
  op: string,
  info: Record<string, unknown>,
  fn: () => Promise<{ result: T; detail: Record<string, unknown> }>,
): Promise<T> {
  const begin = recorder.event(`${op}-begin`, { ...info, mem: recorder.memorySnapshot() });
  const startedAt = performance.now();
  try {
    const { result, detail } = await fn();
    recorder.event(`${op}-end`, {
      begin,
      ms: round(performance.now() - startedAt),
      ...detail,
      mem: recorder.memorySnapshot(),
    });
    return result;
  } catch (error) {
    recorder.event(`${op}-error`, {
      begin,
      ms: round(performance.now() - startedAt),
      error: describeError(error),
      mem: recorder.memorySnapshot(),
    });
    throw error;
  }
}

/** Accepts both a bare handle string and a pool entry wrapping one. */
function defaultHandleOf(result: unknown): string {
  if (typeof result === "string") return result;
  const key = (result as { key?: unknown } | null)?.key;
  return typeof key === "string" ? key : String(result);
}

function vectorsBytes(vectors: unknown[]): number {
  let bytes = 0;
  for (const vector of vectors ?? []) {
    const data = (vector as { data?: unknown; isNA?: { byteLength?: number } } | null)?.data;
    if (!data) continue;
    const byteLength = (data as { byteLength?: number }).byteLength;
    if (typeof byteLength === "number") {
      bytes += byteLength;
    } else if (Array.isArray(data)) {
      // String and Bytes columns arrive as plain arrays, and those are the ones
      // that actually threaten the JS heap, so they are sampled not skipped.
      bytes += sampledArrayBytes(data);
    }
    const isNA = (vector as { isNA?: { byteLength?: number } }).isNA;
    if (typeof isNA?.byteLength === "number") bytes += isNA.byteLength;
  }
  return bytes;
}

function sampledArrayBytes(data: unknown[]): number {
  const sampleSize = Math.min(data.length, 32);
  if (sampleSize === 0) return 0;
  let sampled = 0;
  for (let i = 0; i < sampleSize; i++) {
    const value = data[Math.floor((i * data.length) / sampleSize)];
    sampled += typeof value === "string" ? value.length * 2 + 24 : 8;
  }
  return Math.round((sampled / sampleSize) * data.length);
}

function ratio(value: number | undefined, base: number | undefined): number | undefined {
  return typeof value === "number" && typeof base === "number" && base > 0
    ? round(value / base)
    : undefined;
}

function shortHandle(handle: string): string {
  return typeof handle === "string" ? handle.slice(0, 24) : String(handle);
}

function describeError(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message ?? error);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
