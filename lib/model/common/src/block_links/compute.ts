import type { ColumnReference } from "../drivers";
import { ExportPool, type ExportNode } from "./export_pool";
import {
  checkExport,
  chooseArgs,
  collectOutgoingReferences,
  dependencyStatus,
  dependentStatus,
  hasUnrunChanges,
  readBlockLabels,
  type ExportCheck,
  type OutgoingReference,
  type ProducerRun,
} from "./status";
import type {
  BlockColumnLinks,
  UnlabeledColumnLinks,
  UnlabeledDependencies,
  UnlabeledDependents,
} from "./types";

/** What the column links of a block are computed from. */
export interface ColumnLinksSource<A extends ExportNode<A>> {
  /** Blocks of the project, in project order. */
  blockIds: readonly string[];
  /** Args of a block: `current` — derived from its current data; `lastRun` — those of its last run. */
  argsOf(blockId: string, which: "current" | "lastRun"): unknown;
  /** Columns that the given args of a block reference. */
  referencesOf(blockId: string, which: "current" | "lastRun"): readonly ColumnReference[];
  /** The last run of a block. Read for the blocks whose exports a reference is checked against. */
  lastRunOf(blockId: string): ProducerRun<A>;
  /**
   * The results a block prepares before it is run; `undefined` while it has none. Read only to
   * label a column its last run does not export.
   */
  stagingOf(blockId: string): undefined | A;
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
): UnlabeledDependencies {
  const pool = new ExportPool(source);
  const above = new Set(blocksAround(source.blockIds, blockId).above);
  const chosen = chooseArgs(argsReads(source, blockId));
  const references =
    chosen.source === "none"
      ? []
      : collectOutgoingReferences(source.referencesOf(blockId, chosen.source));
  return {
    argsSource: chosen.source,
    items: references.map((reference) => {
      if (!above.has(reference.producerBlockId)) {
        return {
          ...reference,
          columnLabel: null,
          status: dependencyStatus({ type: "unavailable" }),
        };
      }
      const { check, columnLabel } = checkReference(pool, reference);
      return { ...reference, columnLabel, status: dependencyStatus(check) };
    }),
  };
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
): UnlabeledDependents {
  const pool = new ExportPool(source);
  const items = blocksAround(source.blockIds, blockId).below.flatMap((dependentBlockId) => {
    const chosen = chooseArgs(argsReads(source, dependentBlockId));
    if (chosen.source === "none") return [];
    return collectOutgoingReferences(source.referencesOf(dependentBlockId, chosen.source))
      .filter((reference) => reference.producerBlockId === blockId)
      .map((reference) => {
        const { check, columnLabel } = checkReference(pool, reference);
        return {
          dependentBlockId,
          output: reference.output,
          ref: reference.ref,
          values: reference.values,
          columnLabel,
          status: dependentStatus(check),
        };
      });
  });
  return { items, hasUnrunChanges: hasUnrunChanges(argsReads(source, blockId)) };
}

/** `links` with the blocks they name labelled by `labelOf`; a block it throws for stays unlabelled. */
export function labelColumnLinks(
  links: UnlabeledColumnLinks,
  labelOf: (blockId: string) => string,
): BlockColumnLinks {
  const { blockId, dependencies, dependents } = links;
  return {
    blockId,
    dependencies: {
      ...dependencies,
      labels: readBlockLabels(
        dependencies.items.map((item) => item.producerBlockId),
        labelOf,
      ),
    },
    dependents: {
      ...dependents,
      labels: readBlockLabels(
        dependents.items.map((item) => item.dependentBlockId),
        labelOf,
      ),
    },
  };
}

// Internals

/** The blocks above `blockId` and those below it, in project order; none when it is not there. */
function blocksAround(
  blockIds: readonly string[],
  blockId: string,
): { above: readonly string[]; below: readonly string[] } {
  const index = blockIds.indexOf(blockId);
  if (index === -1) return { above: [], below: [] };
  return { above: blockIds.slice(0, index), below: blockIds.slice(index + 1) };
}

function argsReads<A extends ExportNode<A>>(source: ColumnLinksSource<A>, blockId: string) {
  return {
    current: () => source.argsOf(blockId, "current"),
    lastRun: () => source.argsOf(blockId, "lastRun"),
  };
}

/**
 * Checks a reference against the last run of its producer. When the last run does not export
 * the column yet, or no longer does, the column's label is taken from the results the producer
 * prepares before it is run; the status stays the last run's.
 */
function checkReference<A extends ExportNode<A>>(
  pool: ExportPool<A>,
  reference: Pick<OutgoingReference, "producerBlockId" | "output" | "values">,
): { check: ExportCheck; columnLabel: null | string } {
  const { producerBlockId, output, values } = reference;
  const result = checkExport(() => pool.lookup(producerBlockId, output), values);
  if (result.columnLabel !== null) return result;
  switch (result.check.type) {
    case "unavailable":
    case "pending":
    case "notRun":
      return { ...result, columnLabel: pool.stagingLabel(producerBlockId, output) };
    default:
      return result;
  }
}
