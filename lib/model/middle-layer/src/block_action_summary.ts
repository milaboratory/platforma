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
  /** When the resource entered the state: server clock, Unix milliseconds. */
  sinceMs: number;
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
