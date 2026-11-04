import type { ColumnUniversalId, ColumnValue } from "../drivers";

/**
 * How a reference an args holds fares against what the last run of the producing block exports:
 * - `ok` — the output is exported and holds every picked value, or the reference picks none;
 * - `pending` — the producer's run, or the column data, is still being computed;
 * - `notRun` — the producer has no last run, so it exports nothing yet;
 * - `unreadable` — the output is exported, but its values cannot be read: the spec does not list
 *   them and the data is not JSON, or looking up or reading the column failed;
 * - `unavailable` — the output is not exported: the producer is deleted, is not above the block
 *   holding the reference, or its run no longer exports the output;
 * - `missingValues` — the output is exported, but lacks the listed picked values.
 */
export type LinkCheck =
  | { type: "ok" }
  | { type: "pending" }
  | { type: "notRun" }
  | { type: "unreadable" }
  | { type: "unavailable" }
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
  status: LinkCheck;
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
  status: LinkCheck;
}

/**
 * Outputs of other blocks a block's args reference: its current args, else those of its last
 * run.
 */
export interface UnlabeledDependencies {
  items: DependencyEntry[];
}

/** Blocks whose args reference a block's outputs, each reference checked against its last run. */
export interface UnlabeledDependents {
  items: DependentEntry[];
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
