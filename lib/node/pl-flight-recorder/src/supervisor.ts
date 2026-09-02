import fs from "node:fs";
import path from "node:path";
import { CRASH_FILE_PREFIX, type CrashMarker, type CrashReason } from "./events";
import { listSessions, sessionIdFromFile } from "./recorder";

export type CrashMarkerInput = {
  /** Session id the parent assigned to the worker; without it the newest open flight log is guessed. */
  sessionId?: string;
  reason?: CrashReason;
  error?: (Error & { code?: string }) | unknown;
  code?: number;
  signal?: string;
  stderrTail?: string;
};

export type SuperviseOptions = {
  /**
   * The session id handed to the worker at spawn (see `FLIGHT_SESSION_ENV`).
   * With it the marker names the dying session with certainty; without it the
   * newest open flight log is taken as a guess.
   */
  sessionId?: string;
  onCrash?: (info: {
    kind: "error" | "exit";
    markerFile: string;
    error?: unknown;
    code?: number;
  }) => void;
};

/** Minimal view of a worker, so callers are not forced to import worker_threads. */
export type SupervisedWorker = {
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
};

/**
 * Records an abnormal end observed from outside the dying thread.
 *
 * A thread that runs out of heap cannot describe its own death: the last reading
 * it wrote predates the blow-up, and when the blow-up is synchronous no sampler
 * tick of its own lands either. The parent is the only place where the cause is
 * known rather than inferred — Node reports `ERR_WORKER_OUT_OF_MEMORY` to it —
 * so the parent writes the verdict down on the dead thread's behalf.
 */
export function writeCrashMarker(dir: string, input: CrashMarkerInput = {}): string {
  fs.mkdirSync(dir, { recursive: true });
  const error = input.error as (Error & { code?: string }) | undefined;
  // Only an id the parent handed to the worker is certain. Reading the newest
  // open flight log is a guess: a concurrent live session that appended after
  // the dying worker's last record would be named instead, so the analyzer
  // treats a guessed id as a hint to be checked against the time window.
  const guessedSessionId = input.sessionId === undefined ? newestOpenSessionId(dir) : undefined;
  const marker: CrashMarker = {
    type: "external-crash",
    wall: Date.now(),
    sessionId: input.sessionId ?? guessedSessionId,
    sessionIdSource:
      input.sessionId !== undefined
        ? "assigned"
        : guessedSessionId !== undefined
          ? "guessed"
          : undefined,
    reason: input.reason ?? classifyReason(input),
    errorCode: error?.code,
    errorName: error?.name,
    message: truncate(String(error?.message ?? input.error ?? ""), 2000),
    exitCode: input.code,
    signal: input.signal,
    stderrTail: truncate(input.stderrTail ?? "", 4000),
  };
  const file = path.join(dir, `${CRASH_FILE_PREFIX}-${marker.wall}.ndjson`);
  fs.writeFileSync(file, `${JSON.stringify(marker)}\n`);
  return file;
}

/** Crash markers in a directory, oldest first. */
export function readCrashMarkers(dir: string): CrashMarker[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const markers: CrashMarker[] = [];
  for (const name of names) {
    if (!name.startsWith(`${CRASH_FILE_PREFIX}-`) || !name.endsWith(".ndjson")) continue;
    try {
      const first = fs.readFileSync(path.join(dir, name), "utf8").split("\n")[0];
      markers.push(JSON.parse(first) as CrashMarker);
    } catch {
      // A marker that cannot be parsed is skipped; it is one line of evidence,
      // not the report.
    }
  }
  return markers.sort((lhs, rhs) => lhs.wall - rhs.wall);
}

/**
 * Attaches crash recording to a middle-layer worker thread.
 *
 * A worker whose isolate exhausts its heap dies alone and the parent receives
 * `ERR_WORKER_OUT_OF_MEMORY`, with or without `resourceLimits`. What
 * `resourceLimits.maxOldGenerationSizeMb` adds is a chosen ceiling: V8's default
 * is several gigabytes, so on a small machine the OS can run out of memory and
 * kill the whole process before V8 ever reports the worker's heap as full — and
 * then there is no parent left to write anything.
 */
export function superviseWorker(
  worker: SupervisedWorker,
  dir: string,
  options: SuperviseOptions = {},
): void {
  // One death fires `error` and then `exit`. Only `error` carries the cause, so
  // a later `exit` must not overwrite it with a bare exit code.
  let recorded = false;
  worker.on("error", (error: Error) => {
    recorded = true;
    const markerFile = writeCrashMarker(dir, { error, sessionId: options.sessionId });
    options.onCrash?.({ kind: "error", error, markerFile });
  });
  worker.on("exit", (code: number) => {
    if (code === 0 || recorded) return;
    const markerFile = writeCrashMarker(dir, {
      reason: "worker-exit",
      code,
      sessionId: options.sessionId,
    });
    options.onCrash?.({ kind: "exit", code, markerFile });
  });
}

// Internals

// The dying session has no terminating record, so only open sessions qualify;
// among those the newest is the best available guess.
function newestOpenSessionId(dir: string): string | undefined {
  const open = listSessions(dir).find((session) => session.crashed);
  return open ? sessionIdFromFile(open.file) : undefined;
}

function classifyReason({ error, code, signal }: CrashMarkerInput): CrashReason {
  const errorCode = (error as { code?: string } | undefined)?.code;
  if (errorCode === "ERR_WORKER_OUT_OF_MEMORY") return "js-heap-out-of-memory";
  if (signal === "SIGKILL") return "killed-by-os";
  if (signal === "SIGABRT" || code === 134) return "abort-or-fatal-allocation-failure";
  if (typeof code === "number" && code !== 0) return "nonzero-exit";
  return "unknown";
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}
