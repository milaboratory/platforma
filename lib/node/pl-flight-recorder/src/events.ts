/**
 * Record types written to a flight log.
 *
 * The log is append-only NDJSON, one record per line, and is read back by
 * tooling that may be older or newer than the writer, so every field beyond
 * {@link FlightRecordBase} is optional and unknown record types are skipped
 * rather than rejected.
 */

/** Memory reading taken by the thread that wrote the record. */
export type MemorySnapshot = {
  /** Resident set size of the whole process. */
  rss: number;
  /** Heap in use by the writing thread's isolate. */
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  /** V8 heap ceiling for the writing thread's isolate. */
  heapLimit: number;
};

type FlightRecordBase = {
  /** Monotonically increasing within one session; used to pair begin with end. */
  seq: number;
  /** Milliseconds since process start, for durations. */
  t: number;
  /** Wall clock, for correlating with the sampler series and crash markers. */
  wall: number;
  type: string;
};

export type FlightRecord = FlightRecordBase & {
  mem?: MemorySnapshot;
  /** Sequence number of the matching begin record, on end and error records. */
  begin?: number;
  [key: string]: unknown;
};

/** Session header, always the first record. */
export type SessionEnvironment = {
  node: string;
  platform: string;
  cpus: number;
  totalMemory: number;
  heapLimit: number;
  execArgv: string[];
  maxOldSpaceSize?: number;
};

/** Written by the sampler thread to its own sibling file. */
export type SamplerRecord = FlightRecordBase & {
  type: "mem-sampler";
  rss: number;
  peakRss: number;
  /** Highest resident size the kernel has seen for this process. */
  maxRss?: number;
  freeMemory: number;
  totalMemory: number;
  /** Where the machine's memory actually is, refreshed less often than `rss`. */
  machine?: MachineMemory;
};

/**
 * The machine's own account of its memory.
 *
 * Resident size is not the whole story on a machine under pressure: macOS moves
 * pages out of a process's resident set into the compressor, and both Unixes
 * swap, so a process can appear to shrink while the memory it asked for is still
 * held. These readings are what a resident-size curve has to be read against.
 */
export type MachineMemory = {
  /** Bytes of process memory the compressor holds, counted before compression. */
  compressedStored?: number;
  /** Physical bytes the compressor itself occupies. */
  compressedOccupied?: number;
  swapUsed?: number;
  swapTotal?: number;
  anonymous?: number;
  fileBacked?: number;
  wired?: number;
  /** Why the reading is missing, when it is. */
  unavailable?: string;
};

/** Written by the parent when a supervised thread or process dies. */
export type CrashMarker = {
  type: "external-crash";
  wall: number;
  /**
   * Session the marker belongs to. Present only when the parent assigned the id
   * to the worker and therefore knows it; never inferred, because a wrong id
   * here would both misattribute the death and stop the right session from
   * claiming it.
   */
  sessionId?: string;
  /**
   * Advisory only: the newest open flight log at the moment of death. A
   * concurrent live session can make this wrong, so it is never matched against
   * — it exists to help a human read a directory by hand.
   */
  guessedSessionId?: string;
  /** Written by an older recorder that put a guess in `sessionId`. */
  sessionIdSource?: "assigned" | "guessed";
  reason: CrashReason;
  errorCode?: string;
  errorName?: string;
  message?: string;
  exitCode?: number;
  signal?: string;
  stderrTail?: string;
  /**
   * What memory looked like when the death was observed, taken by the parent.
   *
   * Without it a marker reading `worker-exit` with exit code 1 is
   * indistinguishable from an ordinary application error, and a reader who
   * starts here would classify an exhausted machine as a bug in the code that
   * happened to be running.
   */
  memoryAtDeath?: {
    /** Resident size of the parent process, which hosts the dying worker. */
    rss: number;
    /** Highest resident size the kernel recorded for it. */
    maxRss: number;
    freeMemory: number;
    totalMemory: number;
    machine?: MachineMemory;
  };
};

export type CrashReason =
  | "js-heap-out-of-memory"
  | "killed-by-os"
  | "abort-or-fatal-allocation-failure"
  | "worker-exit"
  | "nonzero-exit"
  | "unknown";

export const SESSION_RECORD = "session";
/** Earliest memory reading of a session, rewritten into every rotated segment. */
export const MEM_BASELINE_RECORD = "mem-baseline";
export const SESSION_END_RECORD = "session-end";
export const FLIGHT_FILE_PREFIX = "flight";
export const SAMPLER_FILE_PREFIX = "mem";
export const CRASH_FILE_PREFIX = "crash";
