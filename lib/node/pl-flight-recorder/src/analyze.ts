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
import { inputRowsMax, joinShapes, structuralFindings, type FindingSeverity } from "./rules";

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

export const THRESHOLDS = {
  /** Fraction of the heap ceiling above which the heap counts as exhausted. */
  heapPressure: 0.85,
  nativeGrowthBytes: 512 * 1024 * 1024,
  amplification: 10,
  unboundedRows: 1_000_000,
  returnedBytes: 256 * 1024 * 1024,
  inlineEntries: 1_000_000,
  stallMs: 2000,
  /** A machine-memory claim needs the process to actually be large. */
  machineRssShare: 0.25,
} as const;

export type Finding = {
  rule: string;
  severity: FindingSeverity;
  detail: string;
  seq?: number;
  path?: string;
  join?: string;
  source?: string;
  block?: string;
};

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
  freeMemoryAtDeath?: number;
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
  rssDelta?: number;
  heapDelta?: number;
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

export type Verdict = {
  outcome: string;
  peakRss: number;
  where: string;
  memoryRegion?: string;
  likelyCause?: string;
  summary: string;
};

export type SessionAnalysis = {
  file: string;
  sessionId: string;
  crashed: boolean;
  truncatedTail: boolean;
  endedReason?: string;
  crashMarker?: CrashMarker;
  env?: SessionEnvironment;
  role?: string;
  meta?: Record<string, unknown>;
  recordCount: number;
  memory: MemoryAnalysis;
  /** Completed operations ranked by resident growth. */
  attribution: OperationSummary[];
  inFlight: OperationSummary[];
  /** The innermost operation that started and never returned. */
  smokingGun?: OperationSummary;
  renders: RenderSummary[];
  findings: Finding[];
  verdict: Verdict;
  timeline: Record<string, unknown>[];
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
  const crashMarker = ended ? undefined : findCrashMarker(dir, sessionId, records);

  const memory = analyzeMemory(records, samples, header.env);
  const operations = pairOperations(records);
  const inFlight = operations.filter((op) => !op.end);

  const findings = [
    ...classifyCrashMarker(crashMarker),
    ...classifyMemory(memory, header.env, crashMarker),
    ...collectStructural(records),
    ...collectEmpirical(records, operations, definitionBySeq(records)),
    ...stallFindings(memory),
  ].sort(bySeverity);

  return {
    file,
    sessionId,
    crashed: !ended,
    truncatedTail,
    endedReason: ended?.reason as string | undefined,
    crashMarker,
    env: header.env,
    role: header.role,
    meta: header.meta,
    recordCount: records.length,
    memory,
    attribution: operations
      .filter((op) => typeof op.rssDelta === "number")
      .sort((lhs, rhs) => (rhs.rssDelta ?? 0) - (lhs.rssDelta ?? 0))
      .slice(0, 12),
    inFlight,
    smokingGun: inFlight.at(-1),
    renders: summarizeRenders(records),
    findings,
    verdict: buildVerdict({ crashed: !ended, memory, inFlight, findings, crashMarker }),
    timeline: records.slice(-40).map(compactRecord),
  };
}

/** Thousands separators, or `unknown` when the count was never observed. */
export function formatCount(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "unknown";
}

/** Binary byte units, or `unknown`. */
export function formatBytes(value: number | undefined): string {
  if (typeof value !== "number") return "unknown";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let index = 0;
  let scaled = Math.abs(value);
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index++;
  }
  const digits = scaled < 10 && index > 0 ? 1 : 0;
  return `${value < 0 ? "-" : ""}${scaled.toFixed(digits)} ${units[index]}`;
}

// Internals

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const REGION_RULES = [
  "js-heap-exhaustion-confirmed",
  "js-heap-exhaustion",
  "off-heap-buffer-growth",
  "native-allocation-growth",
  "machine-memory-exhausted",
];

const CAUSE_RULES = [
  "cross-join",
  "axis-domain-mismatch",
  "join-amplification",
  "unbounded-getData",
  "huge-inline-column",
];

/**
 * The marker for a session is the one that names it with an id the parent
 * assigned. A guessed id — read off the newest open log at the moment of death —
 * can name a concurrent live session instead of the dying one, so it counts only
 * when the time window agrees. Markers without an id fall back to the window
 * alone: between this session's last record and the start of whichever session
 * began next, and never before this session's own start.
 */
function findCrashMarker(
  dir: string,
  sessionId: string,
  records: FlightRecord[],
): CrashMarker | undefined {
  const markers = readCrashMarkers(dir);
  const assigned = markers.find(
    (marker) => marker.sessionId === sessionId && marker.sessionIdSource === "assigned",
  );
  if (assigned) return assigned;

  const lastWall = records.at(-1)?.wall ?? 0;
  const thisStart = sessionStartFromId(sessionId);
  const nextStart = listSessions(dir)
    .map((session) => sessionStartFromId(sessionIdFromFile(session.file)))
    .filter((start) => start > thisStart)
    .sort((lhs, rhs) => lhs - rhs)[0];
  // A marker cannot predate the session it belongs to; the small backward
  // tolerance only absorbs clock drift between the parent and the worker.
  const notBefore = Math.max(thisStart, lastWall - 1000);
  const inWindow = (marker: CrashMarker) =>
    marker.wall >= notBefore && (nextStart === undefined || marker.wall < nextStart);

  const guessed = markers.find(
    (marker) =>
      marker.sessionId === sessionId && marker.sessionIdSource !== "assigned" && inWindow(marker),
  );
  if (guessed) return guessed;
  return markers.find((marker) => marker.sessionId === undefined && inWindow(marker));
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
  const rssSeries = samples.length
    ? samples.map((s) => ({ wall: s.wall, rss: s.rss, freeMemory: s.freeMemory }))
    : selfSeries.map((s) => ({ wall: s.wall, rss: s.rss }));

  const last = selfSeries.at(-1);
  const lastSample = samples.at(-1);
  const heapLimit = last?.heapLimit ?? env?.heapLimit;

  return {
    samplerPresent: samples.length > 0,
    sampleCount: rssSeries.length,
    rssSeries,
    peakRss: Math.max(0, ...rssSeries.map((s) => s.rss ?? 0)),
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
    freeMemoryAtDeath: lastSample?.freeMemory,
    totalMemory: lastSample?.totalMemory ?? env?.totalMemory,
  };
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
    summary.failed = record.type.endsWith("-error");
    const beginMem = beginMemory.get(summary.seq);
    if (beginMem && record.mem) {
      summary.rssDelta = record.mem.rss - beginMem.rss;
      summary.heapDelta = record.mem.heapUsed - beginMem.heapUsed;
    }
  }
  return operations;
}

function collectStructural(records: FlightRecord[]): Finding[] {
  const enclosing = enclosingRenders(records);
  const out: Finding[] = [];
  for (const record of records) {
    // Rules run here rather than at record time, so they can be revised against
    // logs that already exist and cost nothing on the hot path.
    for (const finding of structuralFindings(recordedDef(record))) {
      out.push({
        rule: finding.rule,
        severity: finding.severity,
        detail: finding.detail,
        path: finding.path,
        join: finding.join,
        source: record.type,
        seq: record.seq,
        block: (record.blockId as string | undefined) ?? enclosing.get(record.seq),
      });
    }
  }
  return out;
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
      open.push({ seq: record.seq, blockId: record.blockId as string | undefined });
    } else if (record.type === "render-end" || record.type === "render-error") {
      const index = open.findIndex((entry) => entry.seq === record.begin);
      if (index >= 0) open.splice(index, 1);
    }
    const innermost = open.at(-1);
    if (innermost?.blockId) out.set(record.seq, innermost.blockId);
  }
  return out;
}

function collectEmpirical(
  records: FlightRecord[],
  operations: OperationSummary[],
  definitions: Map<number, unknown>,
): Finding[] {
  const out: Finding[] = [];
  const beginBySeq = new Map(records.map((record) => [record.seq, record]));
  for (const record of records) {
    if (record.type === "getShape-end") {
      // The observed row count is compared against what the definition of the
      // table declared as input, which is looked up here rather than carried on
      // the record.
      const begin = record.begin === undefined ? undefined : beginBySeq.get(record.begin);
      const joinSeq = begin?.joinSeq as number | undefined;
      const declared = joinSeq === undefined ? undefined : inputRowsMax(definitions.get(joinSeq));
      const rows = record.rows as number | undefined;
      const amplification =
        typeof rows === "number" && typeof declared === "number" && declared > 0
          ? Math.round((rows / declared) * 100) / 100
          : undefined;
      if ((amplification ?? 0) >= THRESHOLDS.amplification) {
        out.push({
          rule: "join-amplification",
          severity: "critical",
          seq: record.seq,
          detail: `join produced ${formatCount(rows)} rows from at most ${formatCount(
            declared,
          )} declared input rows (x${amplification})`,
        });
      }
    }
    const tableRows = (record.tableRows as number | undefined) ?? 0;
    if (
      record.type === "getData-begin" &&
      record.unbounded &&
      tableRows > THRESHOLDS.unboundedRows
    ) {
      out.push({
        rule: "unbounded-getData",
        severity: "critical",
        seq: record.seq,
        detail: `getData with no row range on a ${formatCount(tableRows)}-row table pulls the whole table into the JS heap`,
      });
    }
    const returnedBytes = (record.returnedBytes as number | undefined) ?? 0;
    if (record.type === "getData-end" && returnedBytes >= THRESHOLDS.returnedBytes) {
      out.push({
        rule: "large-getData-result",
        severity: "high",
        seq: record.seq,
        detail: `${formatBytes(returnedBytes)} of column data returned into JS in one call`,
      });
    }
    if (record.type.startsWith("createP")) {
      for (const inline of inlineColumns(recordedDef(record))) {
        if ((inline.entries ?? 0) < THRESHOLDS.inlineEntries) continue;
        out.push({
          rule: "huge-inline-column",
          severity: "high",
          seq: record.seq,
          detail: `model passed an inline column of ${formatCount(inline.entries)} entries (~${formatBytes(
            inline.approxBytes,
          )}) through the sandbox`,
        });
      }
    }
  }
  for (const op of operations) {
    if ((op.rssDelta ?? 0) < THRESHOLDS.nativeGrowthBytes) continue;
    out.push({
      rule: "operation-memory-spike",
      severity: "high",
      seq: op.seq,
      detail: `${op.op} grew RSS by ${formatBytes(op.rssDelta)} (heap ${formatBytes(op.heapDelta ?? 0)})`,
    });
  }
  return out;
}

function classifyCrashMarker(marker: CrashMarker | undefined): Finding[] {
  if (!marker) return [];
  const explanation: Record<string, string> = {
    "js-heap-out-of-memory":
      "the supervisor received ERR_WORKER_OUT_OF_MEMORY: the middle-layer thread exceeded its V8 heap limit",
    "abort-or-fatal-allocation-failure":
      "the process aborted on a fatal allocation failure (V8 fatal out-of-memory, or a failed native allocation)",
    "killed-by-os":
      "the OS killed the process (SIGKILL), which is what an out-of-memory kill looks like",
  };
  const firstLine = marker.message ? marker.message.split("\n")[0] : "";
  return [
    {
      rule:
        marker.reason === "js-heap-out-of-memory"
          ? "js-heap-exhaustion-confirmed"
          : `crash-${marker.reason}`,
      severity: "critical",
      source: "supervisor",
      detail: `${explanation[marker.reason] ?? marker.reason}${firstLine ? ` — ${firstLine}` : ""}`,
    },
  ];
}

function classifyMemory(
  memory: MemoryAnalysis,
  env: SessionEnvironment | undefined,
  crashMarker: CrashMarker | undefined,
): Finding[] {
  const out: Finding[] = [];

  // On macOS `os.freemem()` sits near zero at all times because the kernel keeps
  // free pages in the file cache, so a low reading alone means nothing: the
  // process itself has to be large before the OS can plausibly have killed it.
  const rssShare = memory.totalMemory ? (memory.rssAtDeath ?? 0) / memory.totalMemory : 0;
  if (
    memory.freeMemoryAtDeath !== undefined &&
    memory.totalMemory &&
    memory.freeMemoryAtDeath < memory.totalMemory * 0.03 &&
    rssShare > THRESHOLDS.machineRssShare
  ) {
    out.push({
      rule: "machine-memory-exhausted",
      severity: "critical",
      detail: `process held ${formatBytes(memory.rssAtDeath)} (${Math.round(rssShare * 100)}%) of ${formatBytes(
        memory.totalMemory,
      )} with ${formatBytes(memory.freeMemoryAtDeath)} free — the OS, not V8, ended the process`,
    });
  }

  // The last in-thread heap reading predates a synchronous blow-up, so a low
  // reading is not evidence of a healthy heap. Say so rather than conclude.
  if (
    !crashMarker &&
    memory.heapPressure !== undefined &&
    memory.heapPressure < THRESHOLDS.heapPressure &&
    memory.worstStallMs >= THRESHOLDS.stallMs
  ) {
    out.push({
      rule: "heap-reading-stale",
      severity: "medium",
      detail: `last JS heap reading is ${formatBytes(memory.heapUsedAtDeath)} but the thread was blocked for ${Math.round(
        memory.worstStallMs,
      )}ms before the log ends, so the heap was never sampled near the crash`,
    });
  }

  if ((memory.heapPressure ?? 0) >= THRESHOLDS.heapPressure) {
    const flag = env?.maxOldSpaceSize ? ` (--max-old-space-size=${env.maxOldSpaceSize})` : "";
    out.push({
      rule: "js-heap-exhaustion",
      severity: "critical",
      detail: `JS heap at ${Math.round((memory.heapPressure ?? 0) * 100)}% of its ${formatBytes(
        memory.heapLimit,
      )} limit${flag}`,
    });
  }

  const offHeap = (memory.externalGrowth ?? 0) + (memory.arrayBuffersGrowth ?? 0);
  const heapGrowth = memory.heapGrowth ?? 0;
  if (memory.rssGrowth >= THRESHOLDS.nativeGrowthBytes && heapGrowth < memory.rssGrowth / 4) {
    const offHeapDominant = offHeap >= THRESHOLDS.nativeGrowthBytes;
    out.push({
      rule: offHeapDominant ? "off-heap-buffer-growth" : "native-allocation-growth",
      severity: "critical",
      detail: offHeapDominant
        ? `RSS grew ${formatBytes(memory.rssGrowth)} while the JS heap grew ${formatBytes(
            heapGrowth,
          )}; off-heap ArrayBuffer/external allocation grew ${formatBytes(offHeap)} — the growth is buffers handed out by the pframes engine, not JavaScript objects. Raising --max-old-space-size will not help.`
        : `RSS grew ${formatBytes(memory.rssGrowth)} while the JS heap grew only ${formatBytes(
            heapGrowth,
          )} — the allocation is native (pframes engine / Arrow buffers), not JavaScript. Raising --max-old-space-size will not help.`,
    });
  }
  return out;
}

function stallFindings(memory: MemoryAnalysis): Finding[] {
  if (memory.worstStallMs < THRESHOLDS.stallMs) return [];
  return [
    {
      rule: "event-loop-stall",
      severity: "medium",
      detail: `the recorded thread was blocked for ${Math.round(
        memory.worstStallMs,
      )}ms — synchronous work (model evaluation, or a blocking native call)`,
    },
  ];
}

function summarizeRenders(records: FlightRecord[]): RenderSummary[] {
  const open = new Map<number, RenderSummary>();
  const out: RenderSummary[] = [];
  for (const record of records) {
    if (record.type === "render-begin") {
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

function buildVerdict(input: {
  crashed: boolean;
  memory: MemoryAnalysis;
  inFlight: OperationSummary[];
  findings: Finding[];
  crashMarker?: CrashMarker;
}): Verdict {
  const { crashed, memory, inFlight, findings, crashMarker } = input;
  const gun = inFlight.at(-1);
  const region = findings.find((finding) => REGION_RULES.includes(finding.rule));
  const cause = findings.find((finding) => CAUSE_RULES.includes(finding.rule));

  const blockId =
    (gun?.info?.blockId as string | undefined) ?? findings.find((finding) => finding.block)?.block;
  return {
    outcome: crashed
      ? `session ended without shutdown${
          crashMarker ? ` — supervisor reported ${crashMarker.reason}` : " (no supervisor marker)"
        }`
      : "clean shutdown",
    peakRss: memory.peakRss,
    where: gun
      ? `${gun.op} started at seq ${gun.seq} and never returned${blockId ? ` (block ${blockId})` : ""}`
      : "no operation was in flight",
    memoryRegion: region?.rule,
    likelyCause: cause?.rule ?? findings[0]?.rule,
    summary: [
      crashed ? "Process died without running shutdown." : "Session closed normally.",
      gun ? `Last unfinished operation: ${gun.op} (seq ${gun.seq}).` : undefined,
      region?.detail,
      cause ? `Probable cause: ${cause.rule} — ${cause.detail}` : undefined,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function inlineColumns(
  def: unknown,
  acc: { entries?: number; approxBytes?: number }[] = [],
): { entries?: number; approxBytes?: number }[] {
  if (!def || typeof def !== "object") return acc;
  const node = def as Record<string, unknown>;
  const data = node.data as { kind?: string; entries?: number; approxBytes?: number } | undefined;
  if (data?.kind === "inline") acc.push(data);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) inlineColumns(child, acc);
    } else if (value && typeof value === "object") {
      inlineColumns(value, acc);
    }
  }
  return acc;
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

/** Definition of each creation call, keyed by the sequence number of its record. */
function definitionBySeq(records: FlightRecord[]): Map<number, unknown> {
  const out = new Map<number, unknown>();
  for (const record of records) {
    const def = recordedDef(record);
    if (def !== undefined) out.set(record.seq, def);
  }
  return out;
}

function bySeverity(lhs: Finding, rhs: Finding): number {
  return (SEVERITY_ORDER[lhs.severity] ?? 9) - (SEVERITY_ORDER[rhs.severity] ?? 9);
}
