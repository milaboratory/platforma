export {
  openRecorder,
  newSessionId,
  listSessions,
  sessionIdFromFile,
  type Recorder,
  type RecorderOptions,
  type SessionFileInfo,
} from "./recorder";

export {
  openRecordingSession,
  CRASH_DIR_ENV,
  CRASH_SESSION_ENV,
  type RecordingSession,
  type RecordingSessionOptions,
} from "./session";

export {
  readCrashMarkers,
  superviseWorker,
  type SupervisedWorker,
  type SuperviseOptions,
} from "./supervisor";

export {
  wrapModelDriver,
  wrapDataDriver,
  recordModelRenderSync,
  createHandleRegistry,
  type HandleRegistry,
  type RenderInfo,
} from "./instrument";

export {
  type LogRecord,
  type MemorySnapshot,
  type SamplerRecord,
  type MachineMemory,
  type CrashMarker,
  type CrashReason,
  type SessionEnvironment,
} from "./events";
