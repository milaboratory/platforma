import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import v8 from "node:v8";
import {
  FLIGHT_FILE_PREFIX,
  MEM_BASELINE_RECORD,
  SESSION_END_RECORD,
  SESSION_RECORD,
  type FlightRecord,
  type MemorySnapshot,
  type SessionEnvironment,
} from "./events";

export type RecorderOptions = {
  /** Directory holding flight logs; created if absent. */
  dir: string;
  /** Which part of the app is recording, e.g. `middle-layer`. */
  role?: string;
  /** Free-form context stored in the session header (app version, project id). */
  meta?: Record<string, unknown>;
  /** Log is rotated past this size so the tail, which explains the crash, survives. */
  maxFileBytes?: number;
  /**
   * Session id assigned by a supervising parent, so the crash marker the parent
   * writes names this session with certainty rather than by inference.
   * Generated when absent.
   */
  sessionId?: string;
};

export type Recorder = {
  readonly sessionId: string;
  readonly file: string;
  /** Appends one record and returns its sequence number. Never throws. */
  event(type: string, payload?: Record<string, unknown>): number;
  /** Memory reading for the calling thread; `rss` is process-wide. */
  memorySnapshot(): MemorySnapshot;
  /** Writes the terminating record. Its absence is how a crash is detected. */
  close(reason?: string): void;
};

export type SessionFileInfo = {
  file: string;
  mtimeMs: number;
  bytes: number;
  /** True when the log has no terminating record, i.e. the process died. */
  crashed: boolean;
};

export type ParsedSession = {
  file: string;
  records: FlightRecord[];
  /** True when the last line was cut mid-write by the kill. */
  truncatedTail: boolean;
};

/**
 * Opens a flight log for this process and writes the session header.
 *
 * Records are appended with a synchronous write rather than through a stream:
 * the process being recorded dies without warning — V8 fatal out-of-memory, a
 * failed native allocation, the OS out-of-memory killer — so no exit hook, no
 * flush and no `finally` block runs. Anything still sitting in a userspace
 * buffer is exactly the part that would have explained the death.
 */
export function openRecorder(options: RecorderOptions): Recorder {
  const {
    dir,
    role = "middle-layer",
    meta = {},
    maxFileBytes = 32 * 1024 * 1024,
    sessionId = newSessionId(),
  } = options;
  fs.mkdirSync(dir, { recursive: true });

  const file = path.join(dir, `${FLIGHT_FILE_PREFIX}-${sessionId}.ndjson`);
  const state: WriterState = {
    fd: fs.openSync(file, "a"),
    bytes: 0,
    preambleBytes: 0,
    seq: 0,
    closed: false,
    header: undefined,
    baselineMem: undefined,
    openBegins: new Map(),
  };

  const memorySnapshot = (): MemorySnapshot => {
    const usage = process.memoryUsage();
    return {
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      heapLimit: v8.getHeapStatistics().heap_size_limit,
    };
  };

  const event = (type: string, payload: Record<string, unknown> = {}): number => {
    if (state.closed) return -1;
    const seq = ++state.seq;
    const record: FlightRecord = {
      seq,
      t: monotonic(),
      wall: Date.now(),
      type,
      ...payload,
    };
    if (state.baselineMem === undefined && record.mem) state.baselineMem = record.mem;
    trackOpenOperation(state, record);
    writeLine(state, file, maxFileBytes, record);
    return seq;
  };

  const recorder: Recorder = {
    sessionId,
    file,
    event,
    memorySnapshot,
    close(reason = "normal") {
      if (state.closed) return;
      event(SESSION_END_RECORD, { reason, mem: memorySnapshot() });
      state.closed = true;
      try {
        fs.closeSync(state.fd);
      } catch {
        // Closing an already-dead descriptor must not fail shutdown.
      }
    },
  };

  // Kept so a rotated log can be given the same header again: the active file
  // must describe its own session even if the parked segment is lost.
  state.header = { role, pid: process.pid, meta, env: describeEnvironment() };
  event(SESSION_RECORD, { ...state.header, mem: memorySnapshot() });

  return recorder;
}

/**
 * Periodic memory record written by the recorded thread itself.
 *
 * Doubles as a stall detector. This timer cannot fire while its thread is inside
 * a long synchronous call, so a gap here that the independent sampler thread
 * does not share means the thread was blocked — which is also why the heap
 * reading nearest a synchronous blow-up is always stale.
 */
export function startSelfSampler(recorder: Recorder, intervalMs = 500): () => void {
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    recorder.event("mem-self", {
      mem: recorder.memorySnapshot(),
      stallMs: Math.max(0, now - last - intervalMs),
    });
    last = now;
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** Flight logs in a directory, newest first, each flagged as crashed or clean. */
export function listSessions(dir: string): SessionFileInfo[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith(`${FLIGHT_FILE_PREFIX}-`) && name.endsWith(".ndjson"))
    .map((name) => {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      return { file, mtimeMs: stat.mtimeMs, bytes: stat.size, crashed: !hasSessionEnd(file) };
    })
    .sort((lhs, rhs) => rhs.mtimeMs - lhs.mtimeMs);
}

/**
 * Parses a flight log, tolerating a final line cut short by a hard kill.
 *
 * A rotated session spans two files: the parked `.1` segment holds the original
 * header and the earlier operations, the active file holds the tail. Both are
 * read so begin records in one segment can be paired with end records in the
 * other; sequence numbers run across the boundary.
 */
export function readSession(file: string): ParsedSession {
  const records: FlightRecord[] = [];
  let truncatedTail = false;
  const parked = `${file}.1`;
  if (fs.existsSync(parked)) {
    for (const line of fs.readFileSync(parked, "utf8").split("\n")) {
      if (line === "") continue;
      try {
        records.push(JSON.parse(line) as FlightRecord);
      } catch {
        // A damaged line in the parked segment costs one record, not the session.
      }
    }
  }
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    if (line === "") continue;
    try {
      records.push(JSON.parse(line) as FlightRecord);
    } catch {
      if (index >= lines.length - 2) truncatedTail = true;
    }
  }
  return { file, records, truncatedTail };
}

/**
 * Mints a session id. A parent that supervises a worker calls this, hands the id
 * to the worker, and keeps it for the crash marker, so both sides agree on the
 * session by construction. The leading timestamp is what
 * {@link sessionStartFromId} reads back.
 */
export function newSessionId(): string {
  return `${Date.now()}-${process.pid}-${randomTag()}`;
}

/** Wall-clock start of a session, taken from the id its file name carries. */
export function sessionStartFromId(sessionId: string): number {
  const start = Number(sessionId.split("-")[0]);
  return Number.isFinite(start) ? start : 0;
}

/** Session id embedded in a flight log's file name. */
export function sessionIdFromFile(file: string): string {
  const match = path.basename(file).match(/^flight-(.+)\.ndjson(\.1)?$/);
  return match ? match[1] : path.basename(file);
}

// Internals

type WriterState = {
  fd: number;
  bytes: number;
  /** Bytes of the carried-forward preamble, which do not count toward the limit. */
  preambleBytes: number;
  seq: number;
  closed: boolean;
  header: Record<string, unknown> | undefined;
  /** Earliest memory reading of the session, so growth stays measurable. */
  baselineMem: MemorySnapshot | undefined;
  /** Begin records with no end yet, keyed by their sequence number. */
  openBegins: Map<number, FlightRecord>;
};

/** Cap on carried-forward begins, so a leak cannot make the preamble unbounded. */
const MAX_CARRIED_BEGINS = 256;

function writeLine(
  state: WriterState,
  file: string,
  maxFileBytes: number,
  record: FlightRecord,
): void {
  let line: string;
  try {
    line = `${JSON.stringify(record, bigintSafe)}\n`;
  } catch {
    line = `${JSON.stringify({ seq: record.seq, type: "record-serialization-failed" })}\n`;
  }
  try {
    // The preamble is not charged against the limit, so a large preamble cannot
    // trigger another rotation on the very next write.
    if (state.bytes - state.preambleBytes + line.length > maxFileBytes) {
      rotate(state, file);
      writePreamble(state);
    }
    fs.writeSync(state.fd, line);
    state.bytes += line.length;
  } catch {
    // A recorder that cannot write stays silent rather than cascading into the
    // application it is only supposed to observe.
  }
}

// The tail is the only part that explains a crash, so the old file is parked
// beside the new one instead of the new writes being dropped. Exactly one parked
// segment is kept, which bounds a session's disk use at twice the file limit.
function rotate(state: WriterState, file: string): void {
  fs.closeSync(state.fd);
  try {
    fs.renameSync(file, `${file}.1`);
  } catch {
    // If the parked slot cannot be written, recording simply continues.
  }
  state.fd = fs.openSync(file, "a");
  state.bytes = 0;
  state.preambleBytes = 0;
}

/**
 * Rewrites into the new segment the three things a report cannot be produced
 * without, so repeated rotation costs only completed operations.
 *
 * Losing an *open* begin record would remove that operation from pairing
 * entirely, and the operation still running at the moment of death is the one
 * the report exists to name. Losing the earliest memory reading would leave the
 * heap series starting mid-session while the sampler's resident series still
 * starts at zero, which biases the classifier toward blaming native memory.
 */
function writePreamble(state: WriterState): void {
  if (state.header) {
    emitPreambleRecord(state, {
      seq: ++state.seq,
      t: monotonic(),
      wall: Date.now(),
      type: SESSION_RECORD,
      ...state.header,
      continuation: true,
    });
  }
  if (state.baselineMem) {
    emitPreambleRecord(state, {
      seq: ++state.seq,
      t: monotonic(),
      wall: Date.now(),
      type: MEM_BASELINE_RECORD,
      mem: state.baselineMem,
      carriedForward: true,
    });
  }
  // Original sequence numbers are kept, which is what lets an end record in a
  // later segment pair with a begin first written in an overwritten one.
  for (const begin of state.openBegins.values()) {
    emitPreambleRecord(state, { ...begin, carriedForward: true });
  }
}

function emitPreambleRecord(state: WriterState, record: FlightRecord): void {
  try {
    const line = `${JSON.stringify(record, bigintSafe)}\n`;
    fs.writeSync(state.fd, line);
    state.bytes += line.length;
    state.preambleBytes += line.length;
  } catch {
    // A preamble that cannot be written must not stop the session.
  }
}

// Open operations are tracked by the same suffix convention the analyzer pairs
// on, so the recorder needs no separate vocabulary for them.
function trackOpenOperation(state: WriterState, record: FlightRecord): void {
  if (record.type.endsWith("-begin")) {
    if (state.openBegins.size < MAX_CARRIED_BEGINS) state.openBegins.set(record.seq, record);
    return;
  }
  if (record.type.endsWith("-end") || record.type.endsWith("-error")) {
    if (typeof record.begin === "number") state.openBegins.delete(record.begin);
  }
}

function hasSessionEnd(file: string): boolean {
  const size = fs.statSync(file).size;
  if (size === 0) return false;
  const window = Math.min(size, 8192);
  const buffer = Buffer.alloc(window);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, buffer, 0, window, size - window);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString("utf8").includes(`"type":"${SESSION_END_RECORD}"`);
}

function describeEnvironment(): SessionEnvironment {
  const maxOldSpaceFlag = process.execArgv.find((arg) => arg.startsWith("--max-old-space-size"));
  return {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    heapLimit: v8.getHeapStatistics().heap_size_limit,
    execArgv: [...process.execArgv],
    maxOldSpaceSize: maxOldSpaceFlag ? Number(maxOldSpaceFlag.split("=")[1]) : undefined,
  };
}

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? Number(value) : value;
}

function monotonic(): number {
  return Math.round(performance.now() * 1000) / 1000;
}

function randomTag(): string {
  return Math.random().toString(36).slice(2, 8);
}
