import type { ColumnUniversalId, ColumnValue } from "../drivers";

/**
 * Why a reference was not checked against what the last run of its producer exports:
 * `unreadable` — the output is exported, but its values cannot be read: the spec does not list
 * them and the data is not JSON, or looking up or reading the column failed.
 */
export type UncheckedReason = "unreadable";

/**
 * State of a reference a block's args hold to an output of another block, judged by what the
 * last run of that block exports:
 * - `ok` — the output is exported and holds every picked value, or the reference picks none;
 * - `pending` — the producer's run, or the column data, is still being computed;
 * - `notRun` — the producer has no last run, so it exports nothing yet; the reference is not
 *   broken, the producer has to be run first;
 * - `unchecked` — the picked values were not checked, for the {@link UncheckedReason} given; an
 *   output the producer does not export is `broken`, not `unchecked`;
 * - `broken` / `unavailable` — the output is not exported: the producer is deleted, is not above
 *   the block, or its run no longer exports the output;
 * - `broken` / `missingValues` — the output is exported, but lacks the listed picked values.
 */
export type DependencyStatus =
  | { type: "ok" }
  | { type: "pending" }
  | { type: "notRun" }
  | { type: "unchecked"; reason: UncheckedReason }
  | { type: "broken"; reason: "unavailable" }
  | { type: "broken"; reason: "missingValues"; values: ColumnValue[] };

/**
 * State of a reference another block's args hold to an output of a block, judged by what the
 * last run of that block exports:
 * - `ok` — the output is exported and holds every picked value, or the reference picks none;
 * - `pending` — the block's run, or the column data, is still being computed;
 * - `notRun` — the block has no last run, so it exports nothing yet;
 * - `unchecked` — the reference was not checked, for the {@link UncheckedReason} given;
 * - `broken` / `notExported` — the block does not export the output: its run no longer exports
 *   the column. The block holding the reference cannot run against it;
 * - `missingValues` — the output is exported, but lacks the listed picked values.
 */
export type DependentStatus =
  | { type: "ok" }
  | { type: "pending" }
  | { type: "notRun" }
  | { type: "unchecked"; reason: UncheckedReason }
  | { type: "broken"; reason: "notExported" }
  | { type: "missingValues"; values: ColumnValue[] };

/** A block whose args reference an output of a block. */
export interface DependentEntry {
  /** The block whose args hold the reference. */
  dependentBlockId: string;
  /** Name of the referenced block's output. */
  output: string;
  /** The column as the dependent block referenced it. */
  ref: ColumnUniversalId;
  /** Values of the column the dependent block picked; `null` when it uses the column as a whole. */
  values: null | ColumnValue[];
  /**
   * `pl7.app/label` of the exported column. When the last run of the producer does not export the
   * column, the label of the column the producer prepares before it is run; `null` when neither
   * has one.
   */
  columnLabel: null | string;
  status: DependentStatus;
}

/** An output of another block that a block's args reference. */
export interface DependencyEntry {
  /** The block the referenced column comes from. */
  producerBlockId: string;
  /** Name of the producer's output. */
  output: string;
  /** The column as the block's args reference it. */
  ref: ColumnUniversalId;
  /** Values of the column the block picked; `null` when it uses the column as a whole. */
  values: null | ColumnValue[];
  /**
   * `pl7.app/label` of the exported column. When the last run of the producer does not export the
   * column, the label of the column the producer prepares before it is run; `null` when neither
   * has one.
   */
  columnLabel: null | string;
  status: DependencyStatus;
}

/**
 * Outputs of other blocks a block's args reference. `argsSource` says which args were read:
 * `current` — derived from the current data; `lastRun` — those of the last run, read when the
 * block has no current ones; `none` when it has neither.
 */
export interface UnlabeledDependencies {
  argsSource: "current" | "lastRun" | "none";
  items: DependencyEntry[];
}

/**
 * Blocks whose args reference a block's outputs. `hasUnrunChanges`: whether the block has changes
 * its last run does not include; the references are checked against that run.
 */
export interface UnlabeledDependents {
  items: DependentEntry[];
  hasUnrunChanges: boolean;
}

/** Column links of block `blockId` before the blocks they name are labelled. */
export interface UnlabeledColumnLinks {
  blockId: string;
  dependencies: UnlabeledDependencies;
  dependents: UnlabeledDependents;
}

/** `labels` maps a producer block id the entries name to its label, for the blocks that have one. */
export interface BlockDependencies extends UnlabeledDependencies {
  labels: Record<string, string>;
}

/** `labels` maps a dependent block id the entries name to its label, for the blocks that have one. */
export interface BlockDependents extends UnlabeledDependents {
  labels: Record<string, string>;
}

/**
 * Column links of block `blockId`: outputs of other blocks its args reference, and blocks whose
 * args reference its outputs, each reference checked against the last run of the block exporting
 * the column.
 */
export interface BlockColumnLinks {
  blockId: string;
  dependencies: BlockDependencies;
  dependents: BlockDependents;
}
