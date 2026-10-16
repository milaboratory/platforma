/**
 * The status of a running block, as the middle layer hands it to the Desktop App.
 *
 * The backend keeps a tree of status contexts, one per render, and writes each reporter's
 * transitions into the context of the render it belongs to. The middle layer folds that tree into
 * a {@link BlockStatusSummary}; the Desktop App renders the summary and computes nothing beyond
 * reading its own clock. See docs/text/work/projects/sdk/block-status/README_teo.md.
 */

/**
 * A node state, spelled as the backend writes it into a transition value. The names match
 * `plapi.StatusState` on the backend and `BlockStatusState` in pl-client; pl-middle-layer asserts
 * that the two sets stay equal.
 *
 * States are lossy by design: they exist for the user, and no logic may depend on them.
 */
export const blockStatusStates = [
  "WaitingForInputs",
  "Running",
  "WaitingWorkdirGate",
  "WaitingSubmissionGate",
  "PopulatingWorkdir",
  "CollectingOutputs",
  "WaitingForScheduler",
  "WaitingForMachine",
  "Terminated",
  "Completed",
] as const;

/** A node state name, e.g. `"PopulatingWorkdir"`. */
export type BlockStatusState = (typeof blockStatusStates)[number];

/** A state a node cannot leave. A node in any other state is live. */
export type BlockStatusTerminalState = Extract<BlockStatusState, "Terminated" | "Completed">;

/** True for a state a node cannot leave. */
export function isTerminalBlockStatusState(state: BlockStatusState): boolean {
  return state === "Terminated" || state === "Completed";
}

/**
 * The phrase shown to the user for each state, from the spec's surface vocabulary.
 *
 * `Terminated` carries the reason the engine reported, so the surface prefixes this phrase to it
 * rather than showing it alone. `Completed` is never shown. `Running` has no phrase in the spec's
 * table, which predates the state: a render evaluating template code is working rather than
 * waiting, and this is the one phrase here that the spec does not fix.
 */
export const blockStatusPhrases: Record<BlockStatusState, string> = {
  WaitingForInputs: "waiting for earlier steps to finish",
  Running: "working",
  WaitingWorkdirGate: "queued to start",
  WaitingSubmissionGate: "waiting for compute quota",
  PopulatingWorkdir: "moving data into place",
  CollectingOutputs: "collecting results",
  WaitingForScheduler: "queued on the cluster",
  WaitingForMachine: "waiting for a machine",
  Terminated: "failed",
  Completed: "",
};

/**
 * How long a state must have held before the surface shows it, in milliseconds.
 *
 * The threshold keeps a run from flashing states it passed through in milliseconds. It is applied
 * by the Desktop App rather than the middle layer: it is a comparison against the current time,
 * and the middle layer has no clock tick to recompute on. The middle layer supplies
 * {@link BlockStatusLine.heldSince}, the Desktop App compares it with now.
 */
export const BlockStatusQuietThresholdMs = 5_000;

/** How many live nodes sit in one state. */
export type BlockStatusStateCount = {
  readonly state: BlockStatusState;
  /** {@link blockStatusPhrases} for the state, so the renderer does not look it up. */
  readonly phrase: string;
  readonly nodes: number;
  /** The earliest time a node of this group entered the state, ms since the epoch. */
  readonly since: number;
  /** The detail of the most recent transition into the state, e.g. `"staging 12 files"`. */
  readonly detail?: string;
};

/**
 * The one line the surface shows: the state that holds the most live nodes.
 *
 * The surface aggregates rather than naming a node, because a block that fans out over samples is
 * held by hundreds of operations at once.
 */
export type BlockStatusLine = {
  readonly state: BlockStatusState;
  /** {@link blockStatusPhrases} for the state. For `Terminated`, append {@link reason}. */
  readonly phrase: string;
  /** Live nodes in this state. */
  readonly nodes: number;
  /** Live nodes in the whole tree, so the surface can say "382 of 400". */
  readonly ofNodes: number;
  /** The earliest time a counted node entered the state, ms since the epoch. */
  readonly heldSince: number;
  /** The detail of the most recent transition into the state. */
  readonly detail?: string;
  /** The reason the engine reported, set only when the state is `Terminated`. */
  readonly reason?: string;
};

/** The status of one block run, folded from its status-context tree. */
export type BlockStatusSummary = {
  /** The block's own `run-id`: two clicks of Run give two different values. */
  readonly runId?: string;
  /** Nodes whose latest transition is not terminal. */
  readonly liveNodes: number;
  /** Every node of the tree, live or finished. */
  readonly totalNodes: number;
  /** Live nodes by state, the largest group first. */
  readonly byState: readonly BlockStatusStateCount[];
  /** The leading group as one line, or undefined when nothing is live. */
  readonly line?: BlockStatusLine;
  /** The first transition anywhere in the tree, ms since the epoch. */
  readonly startedAt?: number;
  /** The most recent transition anywhere in the tree, ms since the epoch. */
  readonly lastChangeAt?: number;
  /** True once the root render has reached a terminal state. */
  readonly done: boolean;
  /** The reason of the first node the tree reports as terminated. */
  readonly failure?: string;
};

/** An empty summary, for a block whose run has not reported anything yet. */
export const EmptyBlockStatusSummary: BlockStatusSummary = {
  liveNodes: 0,
  totalNodes: 0,
  byState: [],
  done: false,
};
