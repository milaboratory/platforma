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
  openFlightSession,
  FLIGHT_DIR_ENV,
  FLIGHT_SESSION_ENV,
  type FlightSession,
  type FlightSessionOptions,
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

// The analysis is the offline half: nothing in the application calls it, and
// nothing should. It is how a bundle of logs is read after the fact.
export {
  analyzeSession,
  analyzeLatest,
  type SessionAnalysis,
  type MemoryAnalysis,
  type OperationSummary,
  type RenderSummary,
  type RequestedSize,
} from "./analyze";

export {
  type FlightRecord,
  type MemorySnapshot,
  type SamplerRecord,
  type MachineMemory,
  type CrashMarker,
  type CrashReason,
  type SessionEnvironment,
} from "./events";
