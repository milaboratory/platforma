export {
  openRecorder,
  newSessionId,
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
  FLIGHT_SESSION_ENV,
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

export { digestDef, REDACTION, type DefDigest, type DefKind } from "./digest";

export {
  redact,
  hashString,
  isHashedString,
  SCHEMA_KEYS,
  SCHEMA_SUBTREE_KEYS,
  SUMMARISED_KEYS,
  COUNTED_KEYS,
  type RedactionStats,
  type RedactOptions,
  type HashedString,
} from "./redact";

export { summarizeData, type DataSummary } from "./data_summary";

export {
  structuralFindings,
  joinShapes,
  inputRowsMax,
  axesUnder,
  axisKey,
  axisNameKey,
  isJoinNode,
  joinChildren,
  type StructuralFinding,
  type FindingSeverity,
  type JoinShape,
  type AxisDescriptor,
} from "./rules";

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
