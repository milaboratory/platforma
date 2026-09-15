import path from "node:path";
import type {
  CrashMarker,
  FlightRecord,
  MemorySnapshot,
  SamplerRecord,
  SessionEnvironment,
} from "./events";
import { SAMPLER_FILE_PREFIX, SESSION_END_RECORD, SESSION_RECORD } from "./events";
import { listSessions, readSession, sessionIdFromFile, sessionStartFromId } from "./recorder";
import { readCrashMarkers } from "./supervisor";
import { axesUnder, axisKey, columnsUnder, inputRowsMax, joinShapes } from "./rules";

/**
 * Turns a flight log into an attributed cause.
 *
 * Three independent lines of evidence are combined: which operation was still
 * running when the process died (an unmatched begin record), where memory
 * actually went (resident growth across each completed operation, and which
 * region grew — JS heap, off-heap buffers, or native), and what the join tree
 * looked like before any data was touched. Any one alone is suggestive;
 * together they name a specific call in a specific block.
 */

const THRESHOLDS = {
  /** Fraction of the heap ceiling above which the heap counts as exhausted. */
  heapPressure: 0.85,
  nativeGrowthBytes: 512 * 1024 * 1024,
  amplification: 10,
  unboundedRows: 1_000_000,
  returnedBytes: 256 * 1024 * 1024,
  inlineEntries: 1_000_000,
  stallMs: 2000,
  /** Backward tolerance when matching a marker by time, for parent/worker clock drift. */
  clockToleranceMs: 1000,
  /** How many open sessions are considered as rivals for an unattributed marker. */
  maxRivalSessions: 8,
  /** A machine-memory claim needs the process to actually be large. */
  machineRssShare: 0.25,
} as const;

/**
 * Bounds assumed for a value whose type does not fix a width, such as a string.
 * The floor is the offset such a value costs even when empty; the ceiling is
 * wide enough to cover the identifiers and keys blocks actually carry.
 */
const VARIABLE_FLOOR = 4;
const VARIABLE_CEILING = 64;

export type MemoryAnalysis = {
  samplerPresent: boolean;
  sampleCount: number;
  rssSeries: { wall: number; rss?: number; freeMemory?: number }[];
  peakRss: number;
  rssAtDeath?: number;
  rssGrowth: number;
  heapUsedAtDeath?: number;
  heapLimit?: number;
  heapPressure?: number;
  heapGrowth?: number;
  externalGrowth?: number;
  arrayBuffersGrowth?: number;
  worstStallMs: number;
  /**
   * Highest resident size the kernel recorded, which no sampling interval can
   * miss and which therefore bounds `peakRss` from above.
   */
  peakMaxRss?: number;
  /**
   * Most process memory the compressor held at once, counted before compression.
   *
   * This is the memory that leaves a resident-size curve without being released:
   * a falling `rss` against a rising figure here is the OS taking pages away, not
   * the process giving them back.
   */
  peakCompressedStored?: number;
  peakSwapUsed?: number;
  worstFreeShare?: number;
  freeMemoryAtDeath?: number;
  /** Lowest free-memory reading of the session, not only the last one. */
  minFreeMemory?: number;
  /** How much resident memory was given back between the peak and the last sample. */
  rssReleasedFromPeak?: number;
  totalMemory?: number;
};

export type OperationSummary = {
  op: string;
  seq: number;
  wall: number;
  info: Record<string, unknown>;
  end?: Record<string, unknown>;
  ms?: number;
  failed?: boolean;
  /** Wall clock when the operation returned; absent while it is still open. */
  endWall?: number;
  rssDelta?: number;
  heapDelta?: number;
  /** Block whose render was open around this operation, where one was. */
  block?: string;
  /** How `block` was established, since an inherited one is weaker evidence. */
  blockFrom?: "recorded" | "enclosing-render" | "creating-call";
  /**
   * Operations that were also open during this one's window, as `op#seq`.
   *
   * A resident-size delta measures the whole process over an interval, so it
   * belongs to this operation alone only when nothing else was running. Where
   * this list is not empty the delta is the interval's, not the operation's.
   */
  concurrent?: string[];
};

export type RenderSummary = {
  seq: number;
  blockId?: string;
  block?: string;
  key?: string;
  end?: boolean;
  failed?: boolean;
  ms?: number;
  stats?: { serOutBytes?: number; serInBytes?: number; [key: string]: unknown };
};

export type SessionAnalysis = {
  file: string;
  sessionId: string;
  crashed: boolean;
  truncatedTail: boolean;
  endedReason?: string;
  crashMarker?: CrashMarker;
  /**
   * True when a crash marker exists but more than one session could own it.
   *
   * The marker is then attached to none of them: naming the wrong session would
   * be worse than naming none, and the fact that one is going unclaimed is itself
   * worth knowing.
   */
  crashMarkerAmbiguous?: boolean;
  env?: SessionEnvironment;
  role?: string;
  meta?: Record<string, unknown>;
  /** What each block id in this log actually is, keyed by block id. */
  blocks: Record<string, BlockIdentity>;
  recordCount: number;
  /**
   * How many times the log rotated. Each rotation re-emits the session header,
   * so environment and metadata survive, but operations older than the retained
   * segments do not — which is why the count is reported rather than implied.
   */
  rotations: number;
  memory: MemoryAnalysis;
  /** Completed operations ranked by resident growth. */
  attribution: OperationSummary[];
  inFlight: OperationSummary[];
  /** The innermost operation that started and never returned. */
  inFlightAtDeath?: OperationSummary;
  renders: RenderSummary[];
  /** What the definition asked for, next to what the process spent. */
  requestedSize: RequestedSize;
  timeline: Record<string, unknown>[];
};

/**
 * What the definition asked for, next to what the process spent.
 *
 * Both are measurements, and they are reported as measurements. The report does
 * not decide from them whose fault a crash is: it sees one run, cannot reproduce
 * it, and knows nothing of what the block was meant to do. Reading these two
 * numbers together is the reader's job.
 */
export type BlockIdentity = {
  /** Package the block came from, as `organization:name`. */
  block?: string;
  blockVersion?: string;
  blockSource?: string;
  sdkVersion?: string;
};

export type RequestedSize = {
  /** Rows the definition could produce at most. */
  requestedRows?: number;
  /** Bytes a row needs, per the value types of its axes and columns. */
  bytesPerRow?: { floor: number; ceiling: number };
  /** Smallest the result could be. */
  floorBytes?: number;
  /** Largest it plausibly could be. */
  ceilingBytes?: number;
  /** Resident growth actually observed, up to the peak. */
  observedBytes: number;
  /** True when a value type does not fix a width, which is why the size is a range. */
  variableWidth: boolean;
  /** Axes the sides of the outermost join have in common. */
  sharedAxes?: string[];
  /** Axes present on only some sides, which is what makes a join replicate. */
  unsharedAxes?: string[];
  /** Distinct values of each shared axis, where every side could be counted. */
  sharedAxisCardinality?: number[];
  /**
   * Rows the join produces if its inputs are spread evenly over the shared key.
   *
   * The bound above is what one group would produce; this is what the counted
   * number of groups produces. They coincide when there is a single group, and
   * the real result lies between them whenever the spread is uneven.
   */
  rowsIfEvenlySpread?: number;
  /** Why no size is given, when none is. */
  unavailable?: string;
};

/** Analyzes the newest crashed session in a directory, else the newest session. */
export function analyzeLatest(
  dir: string,
  options: { preferCrashed?: boolean } = {},
): SessionAnalysis | undefined {
  const { preferCrashed = true } = options;
  const sessions = listSessions(dir);
  if (sessions.length === 0) return undefined;
  const target = (preferCrashed ? sessions.find((s) => s.crashed) : undefined) ?? sessions[0];
  return analyzeSession(target.file, dir);
}

/** Analyzes one flight log, merging the sibling sampler series when present. */
export function analyzeSession(file: string, dir: string = path.dirname(file)): SessionAnalysis {
  const { records, truncatedTail } = readSession(file);
  const header = (records.find((r) => r.type === SESSION_RECORD) ?? {}) as FlightRecord & {
    env?: SessionEnvironment;
    role?: string;
    meta?: Record<string, unknown>;
  };
  const sessionId = sessionIdFromFile(file);
  const samples = readSamples(path.join(dir, `${SAMPLER_FILE_PREFIX}-${sessionId}.ndjson`));

  const ended = records.find((r) => r.type === SESSION_END_RECORD);
  const attribution = ended
    ? { marker: undefined, ambiguous: false }
    : findCrashMarker(dir, sessionId, records);
  const crashMarker = attribution.marker;

  const memory = analyzeMemory(records, samples, header.env);
  const operations = pairOperations(records);
  const inFlight = operations.filter((op) => !op.end);

  return {
    file,
    sessionId,
    crashed: !ended,
    truncatedTail,
    endedReason: ended?.reason as string | undefined,
    crashMarker,
    ...(attribution.ambiguous ? { crashMarkerAmbiguous: true } : {}),
    blocks: blockIdentities(records),
    env: header.env,
    role: header.role,
    meta: header.meta,
    recordCount: records.length,
    rotations: records.filter((r) => r.type === SESSION_RECORD && r.continuation === true).length,
    memory,
    attribution: operations
      .filter((op) => typeof op.rssDelta === "number")
      .sort((lhs, rhs) => (rhs.rssDelta ?? 0) - (lhs.rssDelta ?? 0))
      .slice(0, 12),
    inFlight,
    inFlightAtDeath: inFlight.at(-1),
    renders: summarizeRenders(records),
    requestedSize: measureRequest(records, memory),
    // Memory samples are excluded before the tail is cut, not after. A session
    // that died inside one long native call writes nothing but samples at the
    // end, so cutting first leaves the tail empty in exactly the case where the
    // last operations matter most; the samples are already drawn as a curve.
    timeline: records
      .filter((record) => record.type !== "mem-sampler" && record.type !== "mem-self")
      .slice(-40)
      .map(compactRecord),
  };
}

// Internals

const CLOCK_TOLERANCE_MS = THRESHOLDS.clockToleranceMs;
const MAX_RIVAL_SESSIONS = THRESHOLDS.maxRivalSessions;

/**
 * The marker for a session is the one whose assigned id names it.
 *
 * Failing that, a marker with no id is attributed by time: a session that died
 * stopped writing, so the marker lands at or just after its last record, while a
 * session that survived kept writing past it. That test only separates them when
 * the other sessions actually did keep writing. When two sessions both look
 * dead, no attribution is made at all — an unattributed marker is reported as
 * such, which is honest, where naming the wrong session is not.
 */
function findCrashMarker(
  dir: string,
  sessionId: string,
  records: FlightRecord[],
): { marker?: CrashMarker; ambiguous: boolean } {
  const markers = readCrashMarkers(dir);
  const assigned = markers.find((marker) => isAssigned(marker) && marker.sessionId === sessionId);
  if (assigned) return { marker: assigned, ambiguous: false };

  const thisStart = sessionStartFromId(sessionId);
  const lastWall = records.at(-1)?.wall ?? 0;
  const others = openSessionEnds(dir).filter((session) => session.sessionId !== sessionId);

  for (const marker of markers) {
    if (isAssigned(marker)) continue;
    // A marker cannot predate the session it belongs to; the backward tolerance
    // only absorbs clock drift between the parent and the worker.
    if (marker.wall < Math.max(thisStart, lastWall - CLOCK_TOLERANCE_MS)) continue;
    const rivals = others.filter(
      (session) => marker.wall >= Math.max(session.start, session.lastWall - CLOCK_TOLERANCE_MS),
    );
    if (rivals.length > 0) return { marker: undefined, ambiguous: true };
    return { marker, ambiguous: false };
  }
  return { marker: undefined, ambiguous: false };
}

/**
 * An older recorder put a guess in `sessionId` and labelled it. Such an id is
 * not identity, so it is read back as an unattributed marker.
 */
function isAssigned(marker: CrashMarker): boolean {
  return marker.sessionId !== undefined && marker.sessionIdSource !== "guessed";
}

/** Last recorded wall clock of every session that has no terminating record. */
function openSessionEnds(dir: string): { sessionId: string; start: number; lastWall: number }[] {
  return listSessions(dir)
    .filter((session) => session.crashed)
    .slice(0, MAX_RIVAL_SESSIONS)
    .map((session) => {
      const id = sessionIdFromFile(session.file);
      let lastWall = 0;
      try {
        lastWall = readSession(session.file).records.at(-1)?.wall ?? 0;
      } catch {
        // A session whose log cannot be read cannot rival anything.
      }
      return { sessionId: id, start: sessionStartFromId(id), lastWall };
    });
}

function readSamples(file: string): SamplerRecord[] {
  try {
    return readSession(file).records as unknown as SamplerRecord[];
  } catch {
    return [];
  }
}

function analyzeMemory(
  records: FlightRecord[],
  samples: SamplerRecord[],
  env: SessionEnvironment | undefined,
): MemoryAnalysis {
  const selfSeries = records
    .filter((record) => record.mem)
    .map((record) => ({ wall: record.wall, ...record.mem! }));
  const rssSeries: MemoryAnalysis["rssSeries"] = samples.length
    ? samples.map((s) => ({ wall: s.wall, rss: s.rss, freeMemory: s.freeMemory }))
    : selfSeries.map((s) => ({ wall: s.wall, rss: s.rss }));

  const last = selfSeries.at(-1);
  const lastSample = samples.at(-1);
  const heapLimit = last?.heapLimit ?? env?.heapLimit;

  const peakRss = Math.max(0, ...rssSeries.map((sample) => sample.rss ?? 0));

  return {
    samplerPresent: samples.length > 0,
    sampleCount: rssSeries.length,
    rssSeries,
    peakRss,
    rssAtDeath: lastSample?.rss ?? last?.rss,
    rssGrowth: rssSeries.length ? (rssSeries.at(-1)?.rss ?? 0) - (rssSeries[0].rss ?? 0) : 0,
    heapUsedAtDeath: last?.heapUsed,
    heapLimit,
    heapPressure:
      last?.heapUsed && heapLimit ? Math.round((last.heapUsed / heapLimit) * 100) / 100 : undefined,
    heapGrowth: growth(selfSeries, "heapUsed"),
    externalGrowth: growth(selfSeries, "external"),
    arrayBuffersGrowth: growth(selfSeries, "arrayBuffers"),
    worstStallMs: Math.max(
      0,
      ...records
        .filter((record) => record.type === "mem-self")
        .map((record) => (record.stallMs as number | undefined) ?? 0),
    ),
    peakMaxRss: maxOf(samples.map((sample) => sample.maxRss)),
    peakCompressedStored: maxOf(samples.map((sample) => sample.machine?.compressedStored)),
    peakSwapUsed: maxOf(samples.map((sample) => sample.machine?.swapUsed)),
    worstFreeShare:
      lastSample?.totalMemory && minOf(samples.map((s) => s.freeMemory)) !== undefined
        ? (minOf(samples.map((s) => s.freeMemory)) ?? 0) / lastSample.totalMemory
        : undefined,
    freeMemoryAtDeath: lastSample?.freeMemory,
    minFreeMemory: minOf(rssSeries.map((sample) => sample.freeMemory)),
    rssReleasedFromPeak: peakRss - (lastSample?.rss ?? last?.rss ?? peakRss),
    totalMemory: lastSample?.totalMemory ?? env?.totalMemory,
  };
}

function minOf(values: (number | undefined)[]): number | undefined {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length ? Math.min(...known) : undefined;
}

function maxOf(values: (number | undefined)[]): number | undefined {
  const known = values.filter((value): value is number => typeof value === "number");
  return known.length ? Math.max(...known) : undefined;
}

function growth(series: Record<string, number | undefined>[], key: string): number | undefined {
  const values = series
    .map((entry) => entry[key])
    .filter((value): value is number => typeof value === "number");
  return values.length ? values[values.length - 1] - values[0] : undefined;
}

// Pairs each begin record with its end or error by sequence number. Unmatched
// begins are what was running when the log stopped.
function pairOperations(records: FlightRecord[]): OperationSummary[] {
  const begins = new Map<number, OperationSummary>();
  const beginMemory = new Map<number, MemorySnapshot>();
  const operations: OperationSummary[] = [];
  for (const record of records) {
    if (record.type.endsWith("-begin")) {
      // A begin rewritten into a rotated segment repeats its sequence number;
      // the operation is already known and must not be counted twice.
      if (begins.has(record.seq)) continue;
      const summary: OperationSummary = {
        op: record.type.replace(/-begin$/, ""),
        seq: record.seq,
        wall: record.wall,
        info: compactRecord(record),
      };
      begins.set(record.seq, summary);
      if (record.mem) beginMemory.set(record.seq, record.mem);
      operations.push(summary);
      continue;
    }
    if (!record.type.endsWith("-end") && !record.type.endsWith("-error")) continue;
    const summary = record.begin === undefined ? undefined : begins.get(record.begin);
    if (!summary) continue;
    summary.end = compactRecord(record);
    summary.ms = record.ms as number | undefined;
    summary.endWall = record.wall;
    summary.failed = record.type.endsWith("-error");
    const beginMem = beginMemory.get(summary.seq);
    if (beginMem && record.mem) {
      summary.rssDelta = record.mem.rss - beginMem.rss;
      summary.heapDelta = record.mem.heapUsed - beginMem.heapUsed;
    }
  }
  markConcurrency(operations);
  attributeToBlocks(operations, records);
  return operations;
}

/**
 * Says which block each operation belongs to, and how that was established.
 *
 * Three sources, weakest last. The call may carry the id itself, recorded while
 * the render that made it was open. Failing that the render enclosing it by
 * sequence number names it. Failing that — the case that matters, a driver call
 * the block's UI made long after any render returned — it is inherited from the
 * call that created the table it operates on, which `joinSeq` points at.
 */
function attributeToBlocks(operations: OperationSummary[], records: FlightRecord[]): void {
  const enclosing = enclosingRenders(records);
  const bySeq = new Map(operations.map((op) => [op.seq, op]));

  for (const op of operations) {
    const recorded = op.info.blockId as string | undefined;
    if (recorded !== undefined) {
      op.block = recorded;
      op.blockFrom = "recorded";
      continue;
    }
    const enclosed = enclosing.get(op.seq);
    if (enclosed !== undefined) {
      op.block = enclosed;
      op.blockFrom = "enclosing-render";
    }
  }

  // Resolved after the direct sources, so an inherited identity is only ever
  // taken from a call that has one of its own.
  for (const op of operations) {
    if (op.block !== undefined) continue;
    const joinSeq = op.info.joinSeq as number | undefined;
    const creator = joinSeq === undefined ? undefined : bySeq.get(joinSeq);
    if (creator?.block === undefined) continue;
    op.block = creator.block;
    op.blockFrom = "creating-call";
  }
}

/** What every block id in the log stands for, from the records that announced it. */
function blockIdentities(records: FlightRecord[]): Record<string, BlockIdentity> {
  const out: Record<string, BlockIdentity> = {};
  for (const record of records) {
    if (record.type !== "block") continue;
    const blockId = record.blockId as string | undefined;
    if (blockId === undefined) continue;
    out[blockId] = {
      block: record.block as string | undefined,
      blockVersion: record.blockVersion as string | undefined,
      blockSource: record.blockSource as string | undefined,
      sdkVersion: record.sdkVersion as string | undefined,
    };
  }
  return out;
}

/**
 * Names, for each completed operation, the operations that overlapped it.
 *
 * Resident size is a property of the process, so the change across one
 * operation's window is only that operation's doing when its window was to
 * itself. A long native call that never returns keeps allocating while unrelated
 * renders start and finish inside it, and those renders would otherwise be
 * credited with memory they never touched. Whether an overlap invalidates a
 * delta is left to the reader: an operation that merely contains another is a
 * different matter from two running side by side, and the log does not say which
 * of them was executing.
 */
function markConcurrency(operations: OperationSummary[]): void {
  for (const op of operations) {
    const endWall = op.endWall;
    if (endWall === undefined) continue;
    const overlapping = operations
      .filter(
        (other) =>
          other !== op &&
          other.wall <= endWall &&
          // An operation with no end was still open, so it covers everything after
          // it began — which is exactly the case that misattributes the most.
          (other.endWall ?? Number.POSITIVE_INFINITY) >= op.wall,
      )
      .map((other) => `${other.op}#${other.seq}`);
    if (overlapping.length > 0) op.concurrent = overlapping;
  }
}

/**
 * Maps each record's sequence number to the block whose render was open at that
 * point. Driver calls carry no block identity of their own — the driver does not
 * know which model asked — so the enclosing render span supplies it.
 */
function enclosingRenders(records: FlightRecord[]): Map<number, string> {
  const out = new Map<number, string>();
  const open: { seq: number; blockId?: string }[] = [];
  for (const record of records) {
    if (record.type === "render-begin") {
      // A render open across a rotation is written twice with one sequence
      // number: once in the segment that was overwritten, once carried into the
      // new one. Pushing both would leave a copy open after the render returned,
      // and every later driver call would be blamed on a block that had finished.
      if (!open.some((entry) => entry.seq === record.seq)) {
        open.push({ seq: record.seq, blockId: record.blockId as string | undefined });
      }
    } else if (record.type === "render-end" || record.type === "render-error") {
      const index = open.findIndex((entry) => entry.seq === record.begin);
      if (index >= 0) open.splice(index, 1);
    }
    const innermost = open.at(-1);
    if (innermost?.blockId) out.set(record.seq, innermost.blockId);
  }
  return out;
}

function summarizeRenders(records: FlightRecord[]): RenderSummary[] {
  const open = new Map<number, RenderSummary>();
  const out: RenderSummary[] = [];
  for (const record of records) {
    if (record.type === "render-begin") {
      // A render open across a rotation is written twice under one sequence
      // number; the carried copy must not become a second, never-finished render.
      if (open.has(record.seq)) continue;
      const summary: RenderSummary = {
        seq: record.seq,
        blockId: record.blockId as string | undefined,
        block: record.block as string | undefined,
        key: record.key as string | undefined,
      };
      open.set(record.seq, summary);
      out.push(summary);
      continue;
    }
    if (record.type !== "render-end" && record.type !== "render-error") continue;
    const summary = record.begin === undefined ? undefined : open.get(record.begin);
    if (!summary) continue;
    summary.end = true;
    summary.ms = record.ms as number | undefined;
    summary.stats = record.stats as RenderSummary["stats"];
    summary.failed = record.type === "render-error";
  }
  return out;
}

/**
 * Measures what the last recorded definition asked for, against what the process
 * spent reaching for it.
 *
 * Row count times row width bounds the result: the value types fix a width for
 * numbers and only a range for strings, so the size is reported as a range too.
 * No conclusion is drawn here. A result far smaller than the memory spent and one
 * that accounts for all of it mean very different things, but which of them holds
 * is read off the numbers by someone who can reproduce the run.
 */
function measureRequest(records: FlightRecord[], memory: MemoryAnalysis): RequestedSize {
  const observedBytes = Math.max(0, memory.peakRss - (memory.rssSeries[0]?.rss ?? 0));

  // The definition the process was carrying is the last one it recorded.
  const def = records
    .map(recordedDef)
    .filter((value) => value !== undefined)
    .at(-1);
  const shape = def === undefined ? undefined : joinShapes(def)[0];
  const requestedRows = shape?.rowsUpperBound;
  if (def === undefined || shape === undefined || requestedRows === undefined) {
    return {
      observedBytes,
      variableWidth: false,
      unavailable:
        def === undefined
          ? "no join definition was recorded"
          : "the inputs of the join have no known row count",
    };
  }

  // Axes are materialized as columns of the result alongside the values, so both
  // count toward the width of a row.
  const types = [
    ...axesUnder(def).map((axis) => axis.type),
    ...columnsUnder(def).map((column) => column.valueType),
  ];
  const bytesPerRow = {
    floor: sum(types.map((type) => valueWidth(type) ?? VARIABLE_FLOOR)),
    ceiling: sum(types.map((type) => valueWidth(type) ?? VARIABLE_CEILING)),
  };
  // Axis keys carry type and domain so that rules can compare them exactly; a
  // reader needs the name that was written in the model.
  const names = new Map(axesUnder(def).map((axis) => [axisKey(axis), axis.name]));
  const name = (key: string) => names.get(key) ?? key;

  return {
    requestedRows,
    bytesPerRow,
    floorBytes: requestedRows * bytesPerRow.floor,
    ceilingBytes: requestedRows * bytesPerRow.ceiling,
    observedBytes,
    variableWidth: types.some((type) => valueWidth(type) === undefined),
    sharedAxes: shape.sharedAxes.map(name),
    unsharedAxes: shape.axisUnion.filter((axis) => !shape.sharedAxes.includes(axis)).map(name),
    sharedAxisCardinality: shape.sharedAxisCardinality,
    rowsIfEvenlySpread: evenlySpreadRows(requestedRows, shape.sharedAxisCardinality),
  };
}

function evenlySpreadRows(
  requestedRows: number,
  cardinality: number[] | undefined,
): number | undefined {
  if (!cardinality || cardinality.length === 0) return undefined;
  const groups = cardinality.reduce((total, count) => total * count, 1);
  return groups > 0 ? Math.round(requestedRows / groups) : undefined;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** Bytes one value occupies, or undefined when the type does not fix a width. */
function valueWidth(type: string | undefined): number | undefined {
  switch (type) {
    case "Int":
    case "Float":
      return 4;
    case "Long":
    case "Double":
      return 8;
    default:
      return undefined;
  }
}

function compactRecord(record: FlightRecord): Record<string, unknown> {
  const { mem, def, ...rest } = record;
  const out: Record<string, unknown> = { ...rest };
  if (mem) out.rss = mem.rss;
  if (def) out.defSummary = summarizeDef(def);
  return out;
}

function summarizeDef(digest: unknown): Record<string, unknown> {
  const typed = digest as { kind?: string; redaction?: { bytes?: number } } | undefined;
  const def = recordedDefFrom(digest);
  const outermost = joinShapes(def)[0];
  return {
    kind: typed?.kind,
    bytes: typed?.redaction?.bytes,
    join: outermost?.join,
    children: outermost?.childCount,
    sharedAxes: outermost?.sharedAxes.length,
    inputRowsMax: outermost?.inputRowsMax ?? inputRowsMax(def),
    rowsUpperBound: outermost?.rowsUpperBound,
  };
}

/** The redacted definition inside a record, if it carries one. */
function recordedDef(record: FlightRecord): unknown {
  return recordedDefFrom(record.def);
}

function recordedDefFrom(digest: unknown): unknown {
  if (!digest || typeof digest !== "object") return undefined;
  return (digest as { def?: unknown }).def;
}
