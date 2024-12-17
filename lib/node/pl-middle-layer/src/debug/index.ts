export type MlDebugFlags = {
  logPFrameRequests: boolean;
  logTreeStats?: 'cumulative' | 'per-request';
};

let flags: MlDebugFlags | undefined = undefined;
export function getDebugFlags() {
  if (flags) return flags;
  flags = {
    logPFrameRequests: process.env.MI_LOG_PFRAMES !== undefined
  };
  if (process.env.MI_LOG_TREE_STAT)
    flags.logTreeStats =
      process.env.MI_LOG_TREE_STAT === 'cumulative' ? 'cumulative' : 'per-request';
  return flags;
}
