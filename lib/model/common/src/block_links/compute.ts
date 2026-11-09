import type { ColumnReference } from "../drivers";
import { ExportPool, type ExportNode, type ExportSource } from "./export_pool";
import { checkExport, collectOutgoingReferences } from "./status";
import type { ColumnLink, ExportVerdict, OutgoingReference } from "./types";

/** Args of a block: `current` — derived from its current data; `lastRun` — those of its last run. */
export type ArgsKind = "current" | "lastRun";

/**
 * What the column links of a block are computed from: the blocks of the project, the columns
 * their args reference, and their runs. A last run is read for the blocks whose exports a
 * reference is checked against; prepared results only to label a column the last run does not
 * export.
 */
export interface ColumnLinksSource<A extends ExportNode<A>> extends ExportSource<A> {
  /** Blocks of the project, in project order. */
  blockIds: readonly string[];
  /** Columns that the given args of a block reference; `undefined` while it has no such args. */
  referencesOf(blockId: string, kind: ArgsKind): undefined | readonly ColumnReference[];
}

/**
 * Outputs of other blocks that the args of `blockId` reference, each checked against the last
 * run of its producer. A block can run only against the blocks above it, so a reference to its
 * own output, to a block below it or to a deleted block is `unavailable`, and its producer is
 * not read. Only the referenced producers are read.
 */
export function computeDependencies<A extends ExportNode<A>>(
  source: ColumnLinksSource<A>,
  blockId: string,
): ColumnLink[] {
  const pool = new ExportPool(source);
  const above = new Set(blocksAround(source.blockIds, blockId).above);
  return outgoingReferences(source, blockId).map((reference): ColumnLink => ({
    ...reference,
    holderBlockId: blockId,
    ...(above.has(reference.producer.blockId) ? checkReference(pool, reference) : NOT_ABOVE),
  }));
}

/**
 * Blocks whose args reference outputs of `blockId`, each reference checked against the last run
 * of `blockId`: the blocks below it, in project order, then in the order their args hold the
 * references. A block above it cannot run against it, so its references are not listed here.
 * Only the last run of `blockId` is read, and the args of the blocks below it.
 */
export function computeDependents<A extends ExportNode<A>>(
  source: ColumnLinksSource<A>,
  blockId: string,
): ColumnLink[] {
  const pool = new ExportPool(source);
  return blocksAround(source.blockIds, blockId).below.flatMap((holderBlockId) =>
    outgoingReferences(source, holderBlockId)
      .filter((reference) => reference.producer.blockId === blockId)
      .map((reference): ColumnLink => ({
        ...reference,
        holderBlockId,
        ...checkReference(pool, reference),
      })),
  );
}

// Internals

/** A reference to a block that is not above the block holding it: it cannot run against it. */
const NOT_ABOVE: ExportVerdict = { check: { type: "unavailable" }, columnLabel: null };

/** The blocks above `blockId` and those below it, in project order; none when it is not there. */
function blocksAround(
  blockIds: readonly string[],
  blockId: string,
): { above: readonly string[]; below: readonly string[] } {
  const index = blockIds.indexOf(blockId);
  if (index === -1) return { above: [], below: [] };
  return { above: blockIds.slice(0, index), below: blockIds.slice(index + 1) };
}

/**
 * Columns of other blocks that the args of `blockId` reference: its current args, else those of
 * its last run. The last run's are read only when the block has no current args.
 */
function outgoingReferences<A extends ExportNode<A>>(
  source: ColumnLinksSource<A>,
  blockId: string,
): OutgoingReference[] {
  return collectOutgoingReferences(
    source.referencesOf(blockId, "current") ?? source.referencesOf(blockId, "lastRun") ?? [],
  );
}

/**
 * Checks a reference against the last run of its producer. When the last run does not export
 * the column yet, or no longer does, the column's label is taken from the results the producer
 * prepares before it is run; the status stays the last run's.
 */
function checkReference<A extends ExportNode<A>>(
  pool: ExportPool<A>,
  reference: Pick<OutgoingReference, "producer" | "values">,
): ExportVerdict {
  const { producer, values } = reference;
  const result = checkExport(() => pool.lookup(producer), values);
  if (result.columnLabel !== null) return result;
  switch (result.check.type) {
    case "unavailable":
    case "pending":
    case "notRun":
      return { ...result, columnLabel: pool.stagingLabel(producer) };
    default:
      return result;
  }
}
