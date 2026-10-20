import {
  Annotation,
  ColumnRegistry,
  collectColumnReferences,
  createGlobalPObjectId,
  readAnnotation,
  type ColumnValue,
  type PObjectId,
  type UpstreamBlockCtx,
} from "@milaboratories/pl-model-common";
import { DataColumn, ResultPoolColumnsProvider, type DataColumnRecipe } from "../../columns";
import {
  BlockRenderCtx,
  TreeNodeAccessor,
  type AccessorHandle,
  type RenderCtxBase,
} from "../../render";
import {
  checkExport,
  chooseArgs,
  collectOutgoingReferences,
  dependencyStatus,
  dependentStatus,
  hasUnrunChanges,
  isProducerFinal,
  readBlockLabels,
  readExportValues,
  type ExportCheck,
  type ExportData,
  type ExportLookup,
} from "./status";
import type {
  BlockDependenciesOutput,
  BlockDependentsOutput,
  DependencyEntry,
  DependentEntry,
} from "./types";

/**
 * Outputs of other blocks this block's args reference, each checked against what the last run of
 * its producer exports. Only the producers referenced are read.
 */
export function computeDependencies(ctx: RenderCtxBase): BlockDependenciesOutput {
  const chosen = chooseArgs({
    current: () => new BlockRenderCtx().args,
    lastRun: () => ctx.activeArgs,
  });
  const argsSource = chosen.source;
  if (chosen.source === "none") return { argsSource, items: [], labels: {} };

  const references = collectOutgoingReferences(collectColumnReferences(chosen.args));
  if (references.length === 0) return { argsSource, items: [], labels: {} };

  const selfBlockId = ctx.blockId;
  // A block cannot run against its own outputs.
  const producerOf = (blockId: string) => (blockId === selfBlockId ? undefined : blockId);
  const pool = ProdPool.create(
    ctx,
    references.map((reference) => reference.producerBlockId).filter((id) => id !== selfBlockId),
  );
  const items = references.map((reference): DependencyEntry => {
    const { check, columnLabel } = checkAgainst(
      pool,
      producerOf(reference.producerBlockId),
      reference.output,
      reference.values,
    );
    return { ...reference, columnLabel, status: dependencyStatus(check) };
  });
  const labels = readBlockLabels(
    items.map((item) => item.producerBlockId),
    (blockId) => ctx.ctx.getBlockLabel(blockId),
  );
  return { argsSource, items, labels };
}

/**
 * Blocks whose args reference outputs of this block, each reference checked against what the last
 * run of this block exports. Only this block's run is read.
 */
export function computeDependents(ctx: RenderCtxBase): BlockDependentsOutput {
  const dependencies = ctx.getOutputDependencies();
  const selfBlockId = ctx.blockId;
  if (dependencies === undefined || selfBlockId === undefined) return { type: "unsupported" };
  const unrun = hasUnrunChanges({
    current: () => new BlockRenderCtx().args,
    lastRun: () => ctx.activeArgs,
  });
  if (dependencies.length === 0)
    return { type: "ok", items: [], labels: {}, hasUnrunChanges: unrun };

  const pool = ProdPool.create(ctx, [selfBlockId]);
  const items = dependencies.map((dependency): DependentEntry => {
    const { check, columnLabel } = checkAgainst(
      pool,
      selfBlockId,
      dependency.output,
      dependency.values,
    );
    return { ...dependency, columnLabel, status: dependentStatus(check) };
  });
  const labels = readBlockLabels(
    items.map((item) => item.dependentBlockId),
    (blockId) => ctx.ctx.getBlockLabel(blockId),
  );
  return { type: "ok", items, labels, hasUnrunChanges: unrun };
}

// Internals

/**
 * Checks a reference to `output` of `producerBlockId`. A runtime that cannot list the runs of the
 * blocks above leaves every reference `unchecked` as `unsupported`. When the last run does not
 * export the column yet, or no longer does, the column's label is taken from the results the
 * producer prepares before it is run; the status stays the last run's.
 */
function checkAgainst(
  pool: ProdPool | undefined,
  producerBlockId: string | undefined,
  output: string,
  picked: null | readonly ColumnValue[],
): { check: ExportCheck; columnLabel: null | string } {
  if (pool === undefined) {
    return { check: { type: "unchecked", reason: "unsupported" }, columnLabel: null };
  }
  const result = checkExport(() => pool.lookup(producerBlockId, output), picked);
  if (result.columnLabel !== null) return result;
  if (result.check.type !== "unavailable" && result.check.type !== "pending") return result;
  return { ...result, columnLabel: pool.stagingLabel(producerBlockId, output) };
}

/**
 * Exports of the last runs of the given blocks, among this block and the blocks above it. Results
 * a block prepares before it is run are left out: they would count an output of a block that
 * never ran as exported, and would turn every reference to a block `pending` while its args are
 * being edited. A column is exported once its spec is in the run. Each export is looked up, and
 * its values read, once. Prepared results are read only for the label of a column the last run
 * does not export.
 */
class ProdPool {
  private readonly blocks: ReadonlyMap<string, UpstreamBlockCtx<AccessorHandle>>;
  private readonly registry: ColumnRegistry<TreeNodeAccessor>;
  private readonly lookups = new Map<string, ExportLookup>();
  private readonly stagingBlocks: UpstreamBlockCtx<AccessorHandle>[];
  private stagingRegistry: undefined | ColumnRegistry<TreeNodeAccessor>;
  private readonly stagingLabels = new Map<string, null | string>();

  /** `undefined` when the runtime cannot list the runs of the blocks above this one. */
  static create(ctx: RenderCtxBase, blockIds: readonly string[]): ProdPool | undefined {
    if (!ctx.ctx.featureFlags?.lazyColumnStatusSupport) return undefined;
    return new ProdPool(ctx, new Set(blockIds));
  }

  private constructor(
    private readonly ctx: RenderCtxBase,
    blockIds: ReadonlySet<string>,
  ) {
    const upstream = ctx.ctx.getUpstreamBlockCtx().filter((block) => blockIds.has(block.blockId));
    const blocks = upstream.map((block) => ({
      blockId: block.blockId,
      prodCtx: block.prodCtx,
      prodIncomplete: block.prodIncomplete,
    }));
    this.blocks = new Map(blocks.map((block) => [block.blockId, block]));
    this.registry = new ColumnRegistry([ResultPoolColumnsProvider(blocks)]);
    this.stagingBlocks = upstream.map((block) => ({
      blockId: block.blockId,
      stagingCtx: block.stagingCtx,
      stagingIncomplete: block.stagingIncomplete,
    }));
  }

  /**
   * What the block exports under `output`; `unavailable` when the block is unknown, or is neither
   * this block nor above it. Whether a missing column is gone for good depends on the producer
   * alone: another block still running above does not make it `pending`.
   */
  lookup(blockId: string | undefined, output: string): ExportLookup {
    if (blockId === undefined) return { type: "unavailable" };
    const key = JSON.stringify([blockId, output]);
    const cached = this.lookups.get(key);
    if (cached !== undefined) return cached;
    const found = this.find(blockId, output);
    this.lookups.set(key, found);
    return found;
  }

  /**
   * `pl7.app/label` of the column the block prepares under `output` before it is run; `null` when
   * the block is unknown, prepares no such column, its spec is not there yet, or it has no label.
   * Names the column only: whether it is exported is the last run's alone.
   */
  stagingLabel(blockId: string | undefined, output: string): null | string {
    if (blockId === undefined || !this.blocks.has(blockId)) return null;
    const key = JSON.stringify([blockId, output]);
    const cached = this.stagingLabels.get(key);
    if (cached !== undefined) return cached;
    const label = this.readStagingLabel(blockId, output);
    this.stagingLabels.set(key, label);
    return label;
  }

  private readStagingLabel(blockId: string, output: string): null | string {
    try {
      this.stagingRegistry ??= new ColumnRegistry([ResultPoolColumnsProvider(this.stagingBlocks)]);
      const leaf = this.stagingRegistry.resolve(createGlobalPObjectId(blockId, output));
      if (leaf === undefined) return null;
      const column = DataColumn.fromAccessor(leaf);
      if (column === undefined) return null;
      return readAnnotation(column.getSpec(), Annotation.Label) ?? null;
    } catch {
      return null;
    }
  }

  private find(blockId: string, output: string): ExportLookup {
    const producer = this.blocks.get(blockId);
    if (producer === undefined) return { type: "unavailable" };

    const leaf = this.registry.resolve(createGlobalPObjectId(producer.blockId, output));
    if (leaf === undefined) {
      const final = isProducerFinal(producer, (handle) => this.ctx.ctx.getInputsLocked(handle));
      return final ? { type: "unavailable" } : { type: "pending" };
    }

    const specStatus = DataColumn.getStatusByAccessor(leaf);
    if (specStatus === "absent") return { type: "unavailable" };
    if (specStatus === "resolving") return { type: "pending" };
    const column = DataColumn.fromAccessor(leaf);
    if (column === undefined) return { type: "pending" };

    const spec = column.getSpec();
    return {
      type: "present",
      columnLabel: readAnnotation(spec, Annotation.Label) ?? null,
      readValues: memoize(() => readExportValues(spec, () => readExportData(column))),
    };
  }
}

/** The data of an exported column, read only when its values are not listed in its spec. */
function readExportData(column: DataColumnRecipe<PObjectId>): ExportData {
  switch (column.getDataStatus()) {
    case "resolving":
      return { type: "pending" };
    case "absent":
      return { type: "absent" };
    case "present": {
      const node = column.getData();
      return node instanceof TreeNodeAccessor ? { type: "present", node } : { type: "absent" };
    }
  }
}

/** A read that runs once its first call returns; a call that throws is not remembered. */
function memoize<T>(read: () => T): () => T {
  let result: undefined | { value: T };
  return () => {
    if (result === undefined) result = { value: read() };
    return result.value;
  };
}
