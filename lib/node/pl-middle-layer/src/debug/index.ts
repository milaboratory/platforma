export type MlDebugFlags = {
  logTreeStats?: "cumulative" | "per-request";
  logProjectMutationStat: boolean;
  logTemplateCacheStat: boolean;
  dumpInitialTreeState: boolean;
  logOutputStatus?: "any" | "unstable-only";
  logOutputRecalculations?: boolean;
  logProjectOverviewStat: boolean;
  logJsExecStat: boolean;
  /** Resolved value of MI_TREE_TRAVERSAL env var, or undefined if not set. */
  treeTraversalMode?: "auto" | "client-bfs" | "backend-streaming";
};

const VALID_TRAVERSAL_MODES = ["auto", "client-bfs", "backend-streaming"] as const;

/**
 * Parse the raw MI_TREE_TRAVERSAL env value into a typed TraversalMode.
 * Returns undefined when raw is undefined (env var absent).
 * Logs a warning and returns "auto" on unrecognised values (AC-TM5).
 * Exported for unit testing.
 */
export function parseTraversalMode(
  raw: string | undefined,
  warn: (msg: string) => void = console.warn,
): "auto" | "client-bfs" | "backend-streaming" | undefined {
  if (raw === undefined) return undefined;
  if ((VALID_TRAVERSAL_MODES as readonly string[]).includes(raw))
    return raw as "auto" | "client-bfs" | "backend-streaming";
  warn(
    `MI_TREE_TRAVERSAL="${raw}" is not a valid traversal mode ` +
      `(valid: ${VALID_TRAVERSAL_MODES.join(", ")}); falling back to "auto"`,
  );
  return "auto";
}

let flags: MlDebugFlags | undefined = undefined;
export function getDebugFlags() {
  if (flags) return flags;
  flags = {
    dumpInitialTreeState: process.env.MI_DUMP_INITIAL_TREE_STATE !== undefined,
    logProjectMutationStat: process.env.MI_LOG_PROJECT_MUTATION_STAT !== undefined,
    logTemplateCacheStat: process.env.MI_LOG_TEMPLATE_CACHE_STAT !== undefined,
    logOutputRecalculations: process.env.MI_LOG_OUTPUT_RECALCULATIONS !== undefined,
    logProjectOverviewStat: process.env.MI_LOG_PROJECT_OVERVIEW_STAT !== undefined,
    logJsExecStat: process.env.MI_LOG_JS_EXEC_STAT !== undefined,
  };
  if (process.env.MI_LOG_OUTPUT_STATUS)
    flags.logOutputStatus =
      process.env.MI_LOG_OUTPUT_STATUS === "unstable-only" ? "unstable-only" : "any";
  if (process.env.MI_LOG_TREE_STAT)
    flags.logTreeStats =
      process.env.MI_LOG_TREE_STAT === "cumulative" ? "cumulative" : "per-request";
  const treeTraversalMode = parseTraversalMode(process.env.MI_TREE_TRAVERSAL);
  if (treeTraversalMode !== undefined) flags.treeTraversalMode = treeTraversalMode;
  return flags;
}
