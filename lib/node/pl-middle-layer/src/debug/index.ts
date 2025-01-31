export type MlDebugFlags = {
  logPFrameRequests: boolean;
  usePFrameRs: boolean;
  logTreeStats?: 'cumulative' | 'per-request';
};

let flags: MlDebugFlags | undefined = undefined;
export function getDebugFlags() {
  if (flags) return flags;
  flags = {
    logPFrameRequests: process.env.MI_LOG_PFRAMES !== undefined,
    usePFrameRs: process.env.MI_USE_PFRAMES_RS !== undefined,
  };
  if (process.env.MI_LOG_TREE_STAT)
    flags.logTreeStats
      = process.env.MI_LOG_TREE_STAT === 'cumulative' ? 'cumulative' : 'per-request';
  return flags;
}
