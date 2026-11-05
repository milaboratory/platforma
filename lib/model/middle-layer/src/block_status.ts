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

const blockStatusStateSet: ReadonlySet<string> = new Set(blockStatusStates);

/** True for a state name this build knows, as a reporter writes it into a transition value. */
export function isBlockStatusState(value: unknown): value is BlockStatusState {
  return typeof value === "string" && blockStatusStateSet.has(value);
}

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

/** The phrase for a run the user stopped. */
export const BlockStatusCancelledPhrase = "cancelled";

/** What one live node is, to the user: "1 task", "5 tasks". */
export function blockStatusTaskCount(nodes: number): string {
  return `${nodes} ${nodes === 1 ? "task" : "tasks"}`;
}

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

/**
 * The block's jobs: the commands it runs on a machine, each counted once by where it is now.
 *
 * A job is a context that a command or its work folder reports in. Jobs the run has not created yet
 * are not counted, so `total` grows while the run fans out.
 */
export type BlockStatusJobs = {
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  /** Executing on a machine. */
  readonly running: number;
  /** Getting their input files. */
  readonly copying: number;
  /** Input files copied so far by the jobs copying now, when their work folders report it. */
  readonly files?: { readonly done: number; readonly total: number };
  /** Waiting for CPU or memory on the server. */
  readonly queued: number;
  /** When the earliest job still queued entered the queue, ms since the epoch. */
  readonly queuedSince?: number;
  /** Held by the cluster (Kubernetes, Batch): it has the job and has not started it. */
  readonly pending: number;
  /** When the earliest job still held by the cluster was handed to it, ms since the epoch. */
  readonly pendingSince?: number;
  /** Saving their results. */
  readonly saving: number;
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
  /** The run's jobs, counted apart from the template renders that only prepare them. */
  readonly jobs: BlockStatusJobs;
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
  /**
   * True when the user stopped the run. The tree is kept as it was when it stopped, so the counters
   * say where each node was, but nothing in it runs any more.
   */
  readonly cancelled?: boolean;
};

/** No jobs yet. */
export const EmptyBlockStatusJobs: BlockStatusJobs = {
  total: 0,
  done: 0,
  failed: 0,
  running: 0,
  copying: 0,
  queued: 0,
  pending: 0,
  saving: 0,
};

/** A summary for a block whose run has not reported anything yet. */
export const EmptyBlockStatusSummary: BlockStatusSummary = {
  availability: "read",
  liveNodes: 0,
  totalNodes: 0,
  byState: [],
  jobs: EmptyBlockStatusJobs,
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
