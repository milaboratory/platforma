export {
  openRecorder,
  startSelfSampler,
  listSessions,
  readSession,
  sessionIdFromFile,
  type Recorder,
  type RecorderOptions,
  type SessionFileInfo,
  type ParsedSession,
} from "./recorder";

export { startMemorySampler, type MemorySampler, type MemorySamplerOptions } from "./sampler";

export {
  openFlightSession,
  FLIGHT_DIR_ENV,
  type FlightSession,
  type FlightSessionOptions,
} from "./session";

export {
  writeCrashMarker,
  readCrashMarkers,
  superviseWorker,
  type CrashMarkerInput,
  type SupervisedWorker,
  type SuperviseOptions,
} from "./supervisor";

export {
  wrapModelDriver,
  wrapDataDriver,
  recordModelRender,
  recordModelRenderSync,
  createHandleRegistry,
  type HandleRegistry,
  type HandleOrigin,
  type RenderInfo,
} from "./instrument";

export {
  digestJoinTree,
  digestPTableDef,
  digestPTableDefV2,
  digestPFrameDef,
  digestSpec,
  digestData,
  digestFilter,
  axisKey,
  axisNameKey,
  REDACTION,
  type DefDigest,
  type PTableDefDigest,
  type JoinNodeDigest,
  type ColumnDigest,
  type StructuralFinding,
  type FindingSeverity,
} from "./digest";

export {
  analyzeSession,
  analyzeLatest,
  formatBytes,
  formatCount,
  THRESHOLDS,
  type SessionAnalysis,
  type Finding,
  type MemoryAnalysis,
  type OperationSummary,
  type RenderSummary,
  type Verdict,
} from "./analyze";

export { renderReport } from "./report";

export {
  FLIGHT_FILE_PREFIX,
  SAMPLER_FILE_PREFIX,
  CRASH_FILE_PREFIX,
  SESSION_RECORD,
  SESSION_END_RECORD,
  type FlightRecord,
  type MemorySnapshot,
  type SamplerRecord,
  type CrashMarker,
  type CrashReason,
  type SessionEnvironment,
} from "./events";
