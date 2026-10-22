import { memoize } from "es-toolkit";
import { Annotation, readAnnotation, type PColumnSpec } from "../drivers";
import { ResourceTypeName } from "../resource_types";
import {
  producerRunState,
  readExportValues,
  type ExportData,
  type ExportLookup,
  type JsonDataNode,
  type ProducerRun,
} from "./status";

/** A step from a block's results to the spec or the data of one column in them. */
export interface ColumnFieldStep {
  readonly field: string;
  readonly assertFieldType: "Input";
  readonly ignoreError: true;
  /** A field missing from a result list that can no longer grow is absent for good. */
  readonly allowPermanentAbsence: true;
}

/** A node of a block's results: the result list, or the spec or data of a column in it. */
export interface ExportNode<Self extends ExportNode<Self>> extends JsonDataNode {
  /** The node the field holds; `undefined` when there is no such field or it holds nothing yet. */
  traverse(step: ColumnFieldStep): Self | undefined;
  /** Whether no more fields can be added to the node. */
  getInputsLocked(): boolean;
  hasData(): boolean;
  getDataAsJson<T = unknown>(): T | undefined;
}

/** Where {@link ExportPool} reads the results of blocks from. */
export interface ExportSource<A> {
  /** The last run of a block. */
  lastRunOf(blockId: string): ProducerRun<A>;
  /** The results a block prepares before it is run; `undefined` while it has none. */
  stagingOf(blockId: string): undefined | A;
}

/**
 * Exports of the last runs of blocks. Results a block prepares before it is run are left out:
 * they would count an output of a block that never ran as exported, and would turn every
 * reference to a block `pending` while its args are being edited. A column is exported once its
 * spec is in the run. Each block is resolved, each export looked up, and its values read, once.
 * Only the fields of the looked-up columns are read, so a change to another column of the run
 * does not touch the lookup. Prepared results are read only for the label of a column the last
 * run does not export.
 */
export class ExportPool<A extends ExportNode<A>> {
  private readonly lastRunOf: (blockId: string) => ProducerRun<A>;
  private readonly stagingOf: (blockId: string) => undefined | A;
  private readonly lookups: (key: ColumnKey) => ExportLookup;
  private readonly stagingLabels: (key: ColumnKey) => null | string;

  constructor(source: ExportSource<A>) {
    this.lastRunOf = memoize((blockId: string) => source.lastRunOf(blockId));
    this.stagingOf = memoize((blockId: string) => source.stagingOf(blockId));
    this.lookups = memoize(
      ({ blockId, output }: ColumnKey) => findExport(this.lastRunOf(blockId), output),
      { getCacheKey: columnKeyString },
    );
    this.stagingLabels = memoize(
      ({ blockId, output }: ColumnKey) => readStagingLabel(this.stagingOf(blockId), output),
      { getCacheKey: columnKeyString },
    );
  }

  /**
   * What the last run of the block exports under `output`. Whether a missing column is gone for
   * good depends on the producer alone: another block still running does not make it `pending`.
   */
  lookup(blockId: string, output: string): ExportLookup {
    return this.lookups({ blockId, output });
  }

  /**
   * `pl7.app/label` of the column the block prepares under `output` before it is run; `null` when
   * the block prepares no such column, its spec is not there yet, or it has no label. Names the
   * column only: whether it is exported is the last run's alone.
   */
  stagingLabel(blockId: string, output: string): null | string {
    return this.stagingLabels({ blockId, output });
  }
}

// Internals

/** One output of one block. */
type ColumnKey = { blockId: string; output: string };

function columnKeyString({ blockId, output }: ColumnKey): string {
  return JSON.stringify([blockId, output]);
}

function findExport<A extends ExportNode<A>>(run: ProducerRun<A>, output: string): ExportLookup {
  if (run.type !== "rendered") return unlistedExport(run);
  const specNode = readColumnField(run.ctx, output, "spec");
  if (specNode === undefined) return unlistedExport(run);
  if (!specNode.hasData()) return { type: "pending" };
  const spec = specNode.getDataAsJson<PColumnSpec>();
  if (spec === undefined) return { type: "pending" };

  return {
    type: "present",
    columnLabel: readAnnotation(spec, Annotation.Label) ?? null,
    readValues: memoize(() => readExportValues(spec, () => readExportData(run.ctx, output))),
  };
}

/** A column whose spec the run does not hold: it may still come while the run is open. */
function unlistedExport<A extends ExportNode<A>>(run: ProducerRun<A>): ExportLookup {
  switch (producerRunState(run, (ctx) => ctx.getInputsLocked())) {
    case "notRun":
      return { type: "notRun" };
    case "open":
      return { type: "pending" };
    case "final":
      return { type: "unavailable" };
  }
}

/**
 * The spec or data of the column `output` in a block's results. Only a result list (`PFrame`)
 * holds columns, under `<output>.spec` and `<output>.data`.
 */
function readColumnField<A extends ExportNode<A>>(
  results: A,
  output: string,
  part: "spec" | "data",
): undefined | A {
  if (results.resourceType.name !== ResourceTypeName.PFrame) return undefined;
  return results.traverse({
    field: `${output}.${part}`,
    assertFieldType: "Input",
    ignoreError: true,
    allowPermanentAbsence: true,
  });
}

/** The data of an exported column, read only when its values are not listed in its spec. */
function readExportData<A extends ExportNode<A>>(results: A, output: string): ExportData {
  const node = readColumnField(results, output, "data");
  if (node !== undefined) return { type: "present", node };
  return results.getInputsLocked() ? { type: "absent" } : { type: "pending" };
}

function readStagingLabel<A extends ExportNode<A>>(
  staging: undefined | A,
  output: string,
): null | string {
  if (staging === undefined) return null;
  try {
    const specNode = readColumnField(staging, output, "spec");
    if (specNode === undefined || !specNode.hasData()) return null;
    const spec = specNode.getDataAsJson<PColumnSpec>();
    if (spec === undefined) return null;
    return readAnnotation(spec, Annotation.Label) ?? null;
  } catch {
    return null;
  }
}
