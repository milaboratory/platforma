/**
 * The status of a running block, as the middle layer hands it to the Desktop App.
 *
 * The backend keeps a tree of status contexts, one per render, and writes each reporter's
 * transitions into the context of the render it belongs to. The middle layer folds that tree into
 * a {@link BlockStatusSummary}; the Desktop App renders the summary and computes nothing beyond
 * reading its own clock.
 *
 * Source: docs/text/work/projects/sdk/block-status/README_teo.md. The spec asks for two things of
 * the user-facing line: it "names the operation that holds this block", and it is "the summary's
 * counters as one sentence". So the summary carries every live counter, and names which one holds
 * the block; the surface renders them.
 */

/**
 * A node state, spelled as the backend and the workflow SDK write it into a transition value. The
 * names match `plapi.ActionState` on the backend and `STATES` in workflow-tengo's action-context
 * library.
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
 * The phrase shown to the user for each state.
 *
 * Written for scientists, not for whoever runs the backend: no engine terms, and each phrase reads
 * after a count of tasks ("5 tasks being prepared"), which is how the surface uses it.
 * `Completed` is never shown: the line reports live nodes, and a completed node is not one.
 * `Terminated` is shown with the reason the engine reported appended.
 */
export const blockStatusPhrases: Record<BlockStatusState, string> = {
  WaitingForInputs: "waiting for inputs",
  Running: "being prepared",
  WaitingWorkdirGate: "waiting to set up",
  WaitingSubmissionGate: "waiting for compute quota",
  PopulatingWorkdir: "copying input files",
  CollectingOutputs: "saving results",
  WaitingForScheduler: "queued for a machine",
  WaitingForMachine: "waiting for a machine to start",
  Terminated: "failed",
  Completed: "",
};

/**
 * The phrase for `Running` reported by a command (namespace `exec`): the job is executing on a
 * machine. `Running` from the render itself means only that template code is being evaluated, and
 * keeps {@link blockStatusPhrases}.
 */
export const BlockStatusOnMachinePhrase = "computing";

/** What one live node is, to the user: "1 task", "5 tasks". */
export function blockStatusTaskCount(nodes: number): string {
  return `${nodes} ${nodes === 1 ? "task" : "tasks"}`;
}

/**
 * How long a state must have held before the surface shows it, in milliseconds.
 *
 * Not from the spec: without it a run flashes states it passed through in milliseconds, which
 * nobody can read. Applied by the Desktop App rather than the middle layer, because it is a
 * comparison against the current time and the middle layer has no clock tick to recompute on. The
 * middle layer supplies {@link BlockStatusLine.heldSince}; the Desktop App compares it with now.
 */
export const BlockStatusQuietThresholdMs = 5_000;

/**
 * How many live nodes sit in one state.
 *
 * These are the spec's "counters by state over live nodes", and the surface renders them as one
 * sentence.
 */
export type BlockStatusStateCount = {
  readonly state: BlockStatusState;
  /** True for `Running` reported by a command executing on a machine, so the two `Running` groups
   * (that, and the render evaluating template code) stay distinct. False for every other state. */
  readonly onMachine: boolean;
  /** {@link blockStatusPhrases} for the state, so the renderer does not look it up. */
  readonly phrase: string;
  readonly nodes: number;
  /**
   * The earliest time any node still in this group entered the state, ms since the epoch, and
   * never later than it was in an earlier summary of the same run.
   */
  readonly since: number;
  /** The detail of the most recent transition into the state, e.g. `"staging 12 files"`. */
  readonly detail?: string;
};

/**
 * Which operation holds the block: the state with the most live nodes, or the failure when the run
 * has ended in one.
 */
export type BlockStatusLine = {
  readonly state: BlockStatusState;
  /** As {@link BlockStatusStateCount.onMachine}. */
  readonly onMachine: boolean;
  /** {@link blockStatusPhrases} for the state. For `Terminated`, append {@link reason}. */
  readonly phrase: string;
  /** Live nodes in this state, or terminated nodes when the state is `Terminated`. */
  readonly nodes: number;
  /** Live nodes in the whole tree, both here and in the `Terminated` case. */
  readonly ofNodes: number;
  /** The earliest time a counted node entered the state, ms since the epoch. */
  readonly heldSince: number;
  /** The detail of the most recent transition into the state. */
  readonly detail?: string;
  /** The reason the engine reported, set only when the state is `Terminated`. */
  readonly reason?: string;
};

/** Why a summary carries no counters. */
export type BlockStatusAvailability =
  /** The tree was read and the run has reported what the summary holds. */
  | "read"
  /** The context could not be read: it is gone, or reading it raised. The counters are unknown,
   * which is not the same as a run that has reported nothing. */
  | "unreadable"
  /** The backend cannot take the `actionContext` link, so no context is created and nothing is
   * ever reported. */
  | "unsupported";

/** The status of one block run, folded from its status-context tree. */
export type BlockStatusSummary = {
  /** Whether the counters below describe the run, or could not be read at all. */
  readonly availability: BlockStatusAvailability;
  /** The block's own `run-id`: two clicks of Run give two different values. */
  readonly runId?: string;
  /** Nodes whose latest transition is not terminal. */
  readonly liveNodes: number;
  /** Every node of the tree, live or finished. */
  readonly totalNodes: number;
  /** Live nodes by state, the largest group first: the spec's counters by state. */
  readonly byState: readonly BlockStatusStateCount[];
  /** The operation holding the block, or undefined when nothing is live. */
  readonly line?: BlockStatusLine;
  /** The first transition anywhere in the tree, ms since the epoch. */
  readonly startedAt?: number;
  /** The most recent transition anywhere in the tree, ms since the epoch. */
  readonly lastChangeAt?: number;
  /** True once the root render has ended and nothing in the tree is still running. */
  readonly done: boolean;
  /** The reason the run ended in, set only when the root render terminated. */
  readonly failure?: string;
};

/** A summary for a block whose run has not reported anything yet. */
export const EmptyBlockStatusSummary: BlockStatusSummary = {
  availability: "read",
  liveNodes: 0,
  totalNodes: 0,
  byState: [],
  done: false,
};

/** A summary for a context that could not be read; its counters are unknown, not zero. */
export const UnreadableBlockStatusSummary: BlockStatusSummary = {
  ...EmptyBlockStatusSummary,
  availability: "unreadable",
};

/** A summary for a backend that does not accept status reports. */
export const UnsupportedBlockStatusSummary: BlockStatusSummary = {
  ...EmptyBlockStatusSummary,
  availability: "unsupported",
};
