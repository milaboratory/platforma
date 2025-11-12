export type MlDebugFlags = {
  logTreeStats?: 'cumulative' | 'per-request';
  logProjectMutationStat: boolean;
  dumpInitialTreeState: boolean;
  logOutputStatus?: 'any' | 'unstable-only';
  logOutputRecalculations?: boolean;
};

let flags: MlDebugFlags | undefined = undefined;
export function getDebugFlags() {
  if (flags) return flags;
  flags = {
    dumpInitialTreeState: process.env.MI_DUMP_INITIAL_TREE_STATE !== undefined,
    logProjectMutationStat: process.env.MI_LOG_PROJECT_MUTATION_STAT !== undefined,
    logOutputRecalculations: process.env.MI_LOG_OUTPUT_RECALCULATIONS !== undefined,
  };
  if (process.env.MI_LOG_OUTPUT_STATUS)
    flags.logOutputStatus = process.env.MI_LOG_OUTPUT_STATUS === 'unstable-only' ? 'unstable-only' : 'any';
  if (process.env.MI_LOG_TREE_STAT)
    flags.logTreeStats = process.env.MI_LOG_TREE_STAT === 'cumulative' ? 'cumulative' : 'per-request';
  return flags;
}
