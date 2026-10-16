import type { ColumnUniversalId, ColumnValue } from "@milaboratories/pl-model-common";

/**
 * Why a reference was not checked against what the last run of its producer exports:
 * - `unreadable` — the output is exported, but its values cannot be read here: the spec does not
 *   list them and the data is not JSON, or looking up or reading the column failed;
 * - `unsupported` — the runtime cannot list the last runs of the blocks above this one.
 */
export type UncheckedReason = "unreadable" | "unsupported";

/**
 * State of a reference this block's args hold to an output of another block, judged by what the
 * last run of that block exports:
 * - `ok` — the output is exported and holds every picked value, or the reference picks none;
 * - `pending` — the producer's run, or the column data, is still being computed;
 * - `unchecked` — the picked values were not checked, for the {@link UncheckedReason} given; an
 *   output the producer does not export is `broken`, not `unchecked`;
 * - `broken` / `unavailable` — the output is not exported: the producer is deleted, is not above
 *   this block, has not run, or its run no longer exports the output;
 * - `broken` / `missingValues` — the output is exported, but lacks the listed picked values.
 */
export type DependencyStatus =
  | { type: "ok" }
  | { type: "pending" }
  | { type: "unchecked"; reason: UncheckedReason }
  | { type: "broken"; reason: "unavailable" }
  | { type: "broken"; reason: "missingValues"; values: ColumnValue[] };

/**
 * State of a reference another block's args hold to an output of this block, judged by what the
 * last run of this block exports:
 * - `ok` — the output is exported and holds every picked value, or the reference picks none;
 * - `pending` — this block's run, or the column data, is still being computed;
 * - `unchecked` — the reference was not checked, for the {@link UncheckedReason} given;
 * - `broken` / `notExported` — this block does not export the output: it has not run, or its run
 *   no longer exports the column. The block holding the reference cannot run against it;
 * - `missingValues` — the output is exported, but lacks the listed picked values.
 */
export type DependentStatus =
  | { type: "ok" }
  | { type: "pending" }
  | { type: "unchecked"; reason: UncheckedReason }
  | { type: "broken"; reason: "notExported" }
  | { type: "missingValues"; values: ColumnValue[] };

/** A block whose args reference an output of this block. */
export interface DependentEntry {
  /** The block whose args hold the reference. */
  dependentBlockId: string;
  /** Name of this block's output. */
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

/** An output of another block that this block's args reference. */
export interface DependencyEntry {
  /** The block the referenced column comes from. */
  producerBlockId: string;
  /** Name of the producer's output. */
  output: string;
  /** The column as this block's args reference it. */
  ref: ColumnUniversalId;
  /** Values of the column this block picked; `null` when it uses the column as a whole. */
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
 * Blocks referencing this block's outputs. `unsupported` when the runtime cannot list them.
 * `labels` maps a dependent block id to its label, for the blocks that have one.
 */
export type BlockDependentsOutput =
  | { type: "unsupported" }
  | { type: "ok"; items: DependentEntry[]; labels: Record<string, string> };

/**
 * Outputs of other blocks this block's args or prerun args reference. `argsSource` says which
 * args were read, over both: `current` when any of them is derived from the current state —
 * ready, or held back by errors its validation found — and then only those are read; `lastRun`
 * when only the ones of the last run or prerun were there; `none` when the block has neither. `labels` maps a producer block id
 * to its label, for the blocks that have one.
 */
export interface BlockDependenciesOutput {
  argsSource: "current" | "lastRun" | "none";
  items: DependencyEntry[];
  labels: Record<string, string>;
}
