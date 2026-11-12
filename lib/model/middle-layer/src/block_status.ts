/**
 * The status of a running block, as the middle layer hands it to the Desktop App.
 *
 * The backend keeps a tree of status contexts, one per render, and writes each reporter's
 * transitions into the context of the render it belongs to. The middle layer folds that tree into
 * a {@link BlockStatusSummary}.
 */

/**
 * The node states this build knows, spelled as the backend and the workflow SDK write them into a
 * transition value. The names match `plapi.ActionState` on the backend and `STATES` in
 * workflow-tengo's action-context library.
 *
 * The backend owns the list: a reporter may write a state added after this release, and the middle
 * layer passes it on as written. Only the lifecycle (`Completed`, `Terminated`, and `Running`
 * reported by a command) carries meaning in the fold; the rest exists for the user.
 */
export const blockStatusStatesRecord = {
  WaitingForInputs: "WaitingForInputs",
  Running: "Running",
  WaitingWorkdirGate: "WaitingWorkdirGate",
  WaitingSubmissionGate: "WaitingSubmissionGate",
  PopulatingWorkdir: "PopulatingWorkdir",
  CollectingOutputs: "CollectingOutputs",
  WaitingForScheduler: "WaitingForScheduler",
  WaitingForMachine: "WaitingForMachine",
  Terminated: "Terminated",
  Completed: "Completed",
} as const;

/** Every state, in the order above. */
export const blockStatusStates = Object.values(blockStatusStatesRecord);

/** A node state name this build knows, e.g. `"PopulatingWorkdir"`. */
export type BlockStatusState = (typeof blockStatusStates)[number];

/** True for a state a node cannot leave. */
export function isTerminalBlockStatusState(state: string): boolean {
  return (
    state === blockStatusStatesRecord.Terminated || state === blockStatusStatesRecord.Completed
  );
}

/** Jobs held by one state: the transition holding each of them has this namespace and state. */
export type BlockStatusJobGroup = {
  /** Who reported the state: `exec` for a command, `workdir` for its work folder, `render`. */
  readonly namespace: string;
  /** As the reporter wrote it, which can be a state this build does not know. */
  readonly state: string;
  readonly count: number;
  /** When the earliest of them entered the state, ms since the epoch. */
  readonly since?: number;
  /** Files done and all, summed over the jobs whose work folders report their progress. */
  readonly files?: { readonly done: number; readonly total: number };
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
  /**
   * Jobs that failed, and renders that failed on their own (not by passing up a failure under
   * them), e.g. one whose command could not start.
   */
  readonly failed: number;
  /** The jobs not ended, by the state holding each, largest group first. */
  readonly byState: readonly BlockStatusJobGroup[];
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
  /** Action contexts that have not ended. */
  readonly activeContexts: number;
  /** Every action context of the run, active or ended. */
  readonly totalContexts: number;
  /** The run's jobs, counted apart from the template renders that only prepare them. */
  readonly jobs: BlockStatusJobs;
  /** The first transition anywhere in the tree, ms since the epoch. */
  readonly startedAt?: number;
  /** The most recent transition anywhere in the tree, ms since the epoch. */
  readonly lastChangeAt?: number;
  /**
   * True once the root render has ended and nothing in the tree is still running, or once a render
   * failed and no job is still working.
   */
  readonly done: boolean;
  /**
   * Set when any render of the run terminated: the innermost message of the earliest one's reason,
   * one line, empty when it gave none. The full reason stays on the node's transitions. Commands
   * that fail are counted in {@link BlockStatusJobs.failed} instead.
   */
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
  byState: [],
};

/** A summary for a block whose run has not reported anything yet. */
export const EmptyBlockStatusSummary: BlockStatusSummary = {
  availability: "read",
  activeContexts: 0,
  totalContexts: 0,
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
