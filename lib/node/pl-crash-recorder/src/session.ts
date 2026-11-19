import { openRecorder, startSelfSampler, type Recorder } from "./recorder";
import { startMemorySampler, type MemorySampler } from "./sampler";
import { createHandleRegistry, type HandleRegistry } from "./instrument";

/** Environment variable naming the directory crash logs are written to. */
export const CRASH_DIR_ENV = "MI_CRASH_RECORDER_DIR";

/**
 * Environment variable carrying the session id a supervising parent assigned.
 * Set it alongside {@link CRASH_DIR_ENV} when spawning the worker and pass the
 * same id to `superviseWorker`.
 */
export const CRASH_SESSION_ENV = "MI_CRASH_RECORDER_SESSION";

export type RecordingSessionOptions = {
  /** Overrides the directory from the environment. */
  dir?: string;
  /** Overrides the session id from the environment. */
  sessionId?: string;
  role?: string;
  meta?: Record<string, unknown>;
  samplerIntervalMs?: number;
  selfSamplerIntervalMs?: number;
};

export type RecordingSession = {
  readonly recorder: Recorder;
  readonly sampler: MemorySampler;
  /** Shared so create calls and later data calls agree on handle identity. */
  readonly registry: HandleRegistry;
  close(reason?: string): void;
};

/**
 * Opens a recording session, or returns undefined when recording is not enabled.
 *
 * Recording is opt-in for now: it appends synchronously on every recorded
 * operation, and that cost has not been measured against a real project, so it
 * is switched on by pointing {@link CRASH_DIR_ENV} at a directory rather than
 * being on by default.
 */
export function openRecordingSession(
  options: RecordingSessionOptions = {},
): RecordingSession | undefined {
  const dir = options.dir ?? process.env[CRASH_DIR_ENV];
  if (!dir) return undefined;

  const recorder = openRecorder({
    dir,
    role: options.role,
    meta: options.meta,
    sessionId: options.sessionId ?? process.env[CRASH_SESSION_ENV] ?? undefined,
  });
  const sampler = startMemorySampler({
    dir,
    sessionId: recorder.sessionId,
    intervalMs: options.samplerIntervalMs,
  });
  const stopSelfSampler = startSelfSampler(recorder, options.selfSamplerIntervalMs);

  return {
    recorder,
    sampler,
    registry: createHandleRegistry(),
    close(reason) {
      stopSelfSampler();
      sampler.stop();
      recorder.close(reason);
    },
  };
}
