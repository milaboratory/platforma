import type { BlockActionContextNode } from "./block_action_context";

/**
 * What a block run is doing:
 * - Failed: some resource terminated.
 * - Running: some resource works (Running, PopulatingWorkdir, CollectingOutputs).
 * - Waiting: some resource waits (for inputs, a gate, the scheduler, a machine).
 * - Done: every reporting resource completed.
 * - NotStarted: nothing reported yet.
 */
export type BlockActionPhase = "Failed" | "Running" | "Waiting" | "Done" | "NotStarted";

/** The current state of a reporting resource: its latest transition outside namespace "render". */
export type BlockActionResourceState = {
  /** Decimal resource ID, as in the report keys. */
  resource: string;
  /** Name of the action context the resource reports into: the template name. */
  context: string;
  namespace: string;
  state: string;
  detail: string;
  reason: string;
  /** Time in the state at the moment of the summary. */
  inStateMs: number;
  /** Readings of the resource by "<namespace>/<key>". */
  readings: Record<string, string>;
};

/** The block-level rollup of an action context tree. */
export type BlockActionSummary = {
  phase: BlockActionPhase;
  /** Resources that work or wait, the one in its state longest first. */
  active: BlockActionResourceState[];
  /** Resources that terminated, with the reason. */
  failed: BlockActionResourceState[];
  /** Resources per current state. */
  states: Record<string, number>;
};

const workingStates = new Set(["Running", "PopulatingWorkdir", "CollectingOutputs"]);

/**
 * Rolls an action context tree up into what the block run is doing. Transitions under namespace
 * "render" mark evaluations, not work, so they do not keep a run active.
 */
export function summarizeBlockActionContext(
  tree: BlockActionContextNode,
  nowMs: number,
): BlockActionSummary {
  const latest = new Map<string, BlockActionResourceState & { sinceNs: bigint }>();
  const readings = new Map<string, Record<string, string>>();

  const visit = (node: BlockActionContextNode) => {
    for (const t of node.transitions) {
      const sinceNs = BigInt(t.timestampNs);
      if (t.namespace === "render" || (latest.get(t.resource)?.sinceNs ?? -1n) > sinceNs) continue;
      latest.set(t.resource, {
        resource: t.resource,
        context: node.baggage["name"] ?? "",
        namespace: t.namespace,
        state: t.state,
        detail: t.detail,
        reason: t.reason,
        inStateMs: Math.max(0, nowMs - Number(sinceNs / 1_000_000n)),
        readings: {},
        sinceNs,
      });
    }
    for (const r of node.readings) {
      const own = readings.get(r.resource) ?? {};
      own[`${r.namespace}/${r.key}`] = r.value;
      readings.set(r.resource, own);
    }
    node.children.forEach(visit);
  };
  visit(tree);

  const summary: BlockActionSummary = { phase: "NotStarted", active: [], failed: [], states: {} };
  for (const { sinceNs: _, ...state } of [...latest.values()].sort((a, b) =>
    a.sinceNs < b.sinceNs ? -1 : 1,
  )) {
    state.readings = readings.get(state.resource) ?? {};
    summary.states[state.state] = (summary.states[state.state] ?? 0) + 1;
    if (state.state === "Terminated") summary.failed.push(state);
    else if (state.state !== "Completed") summary.active.push(state);
  }

  if (summary.failed.length > 0) summary.phase = "Failed";
  else if (summary.active.some((s) => workingStates.has(s.state))) summary.phase = "Running";
  else if (summary.active.length > 0) summary.phase = "Waiting";
  else if (latest.size > 0) summary.phase = "Done";
  return summary;
}
