import type { ColumnReference, ColumnValue } from "../drivers";
import type { BlockOutput } from "../ref";

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

/** A column of another block that a block's args reference, with the values picked from it. */
export interface OutgoingReference extends ColumnReference {
  /** The block output the column is computed from. */
  producer: BlockOutput;
}

/**
 * How a reference fares against the last run of its producer, with the label of the column:
 * `pl7.app/label` of the exported column, or, when the last run does not export it, of the
 * column the producer prepares before it is run; `null` when neither has one.
 */
export interface ExportVerdict {
  check: LinkCheck;
  columnLabel: null | string;
}

/** A reference one block's args hold to a column another block exports, as it was checked. */
export interface ColumnLink extends OutgoingReference, ExportVerdict {
  /** The block whose args hold the reference. */
  holderBlockId: string;
}

/**
 * Column links of block `blockId`: `dependencies` — outputs of other blocks its args reference,
 * its current args, else those of its last run; `dependents` — references the args of other
 * blocks hold to its outputs. Each is checked against the last run of the block exporting the
 * column. `labels` maps the other blocks the links name to their labels, for those that have one.
 */
export interface BlockColumnLinks {
  blockId: string;
  dependencies: ColumnLink[];
  dependents: ColumnLink[];
  labels: Record<string, string>;
}
