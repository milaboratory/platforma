/**
 * The status of a running block, as the middle layer hands it to the Desktop App.
 *
 * The backend keeps a tree of status contexts, one per render, and writes each reporter's
 * transitions into the context of the render it belongs to. The middle layer folds that tree into
 * a {@link BlockStatusSummary}.
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
  /** The run's jobs, counted apart from the template renders that only prepare them. */
  readonly jobs: BlockStatusJobs;
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
