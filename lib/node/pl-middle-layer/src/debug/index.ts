export type MlDebugFlags = {
  logPFrameRequests: boolean;
  logTreeStats?: 'cumulative' | 'per-request';
  dumpInitialTreeState: boolean;
};

let flags: MlDebugFlags | undefined = undefined;
export function getDebugFlags() {
  if (flags) return flags;
  flags = {
    logPFrameRequests: process.env.MI_LOG_PFRAMES !== undefined,
    dumpInitialTreeState: process.env.MI_DUMP_INITIAL_TREE_STATE !== undefined,
  };
  if (process.env.MI_LOG_TREE_STAT)
    flags.logTreeStats
      = process.env.MI_LOG_TREE_STAT === 'cumulative' ? 'cumulative' : 'per-request';
  return flags;
}
