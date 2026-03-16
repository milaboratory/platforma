import type { PColumnSelector, PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { selectorsToPredicate } from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render/accessor";
import type { RenderCtxBase, ResultPool } from "../render";
import type { ColumnSnapshot } from "./column_snapshot";
import type { ColumnDataStatus } from "./column_snapshot";
import type { ColumnProvider } from "./column_provider";
import { OutputColumnProvider } from "./column_provider";
import { ResourceTypeName } from "@milaboratories/pl-client";
import type { ValueOf } from "@milaboratories/helpers";

/**
 * Collect ColumnProviders from all render context sources:
 *
 * - **resultPool** — all upstream columns (always included)
 * - **outputs** — PFrame fields from block execution outputs
 * - **prerun** — PFrame fields from prerun/staging results
 *
 * Returns an array of providers suitable for `ColumnCollectionBuilder.addSource()`.
 */
export function collectCtxColumnProviders<A, U>(ctx: RenderCtxBase<A, U>): ColumnProvider[] {
  const providers: ColumnProvider[] = [];

  // ResultPool — all upstream columns
  providers.push(new ResultPoolColumnProvider(ctx.resultPool));

  // Outputs — each PFrame-like output field becomes a provider
  const outputs = ctx.outputs;
  if (outputs) {
    providers.push(...collectPFrameProviders(outputs));
  }

  // Prerun — same treatment as outputs
  const prerun = ctx.prerun;
  if (prerun) {
    providers.push(...collectPFrameProviders(prerun));
  }

  return providers;
}

/**
 * Adapter wrapping ResultPool into the new ColumnProvider interface.
 *
 * - `isColumnListComplete()` always returns true — the result pool
 *   is a stable snapshot within a single render cycle.
 * - Data status is derived from the underlying TreeNodeAccessor:
 *   ready (getIsReadyOrError), computing, or absent (no data resource).
 */
export class ResultPoolColumnProvider implements ColumnProvider {
  constructor(private readonly pool: ResultPool) {}

  selectColumns(
    selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[],
  ): ColumnSnapshot[] {
    const predicate = typeof selectors === "function" ? selectors : selectorsToPredicate(selectors);
    const pColumns = this.pool.selectColumns(predicate);
    return pColumns.map((col) => toSnapshot(col.id, col.spec, col.data));
  }

  getColumn(id: PObjectId): ColumnSnapshot | undefined {
    // ResultPool has no direct ID lookup — linear scan over all columns
    const all = this.selectColumns(() => true);
    return all.find((col) => col.id === id);
  }

  isColumnListComplete(): boolean {
    return true;
  }
}

function toSnapshot(
  id: PObjectId,
  spec: PColumnSpec,
  accessor: TreeNodeAccessor | undefined,
): ColumnSnapshot {
  if (accessor === undefined) {
    return { id, spec, dataStatus: "absent" as ColumnDataStatus, data: undefined };
  }
  const isReady = accessor.getIsReadyOrError();
  return {
    id,
    spec,
    dataStatus: (isReady ? "ready" : "computing") as ColumnDataStatus,
    data: { get: () => (isReady ? accessor : undefined) },
  };
}

/**
 * Recursively walk the output tree starting from `accessor`.
 * - If a node's resourceType is PFrame → wrap it as OutputColumnProvider.
 * - If a node's resourceType is StdMap/std/map → recurse into its output fields.
 * - Otherwise → skip (leaf of unknown type).
 */
function collectPFrameProviders(accessor: TreeNodeAccessor): ColumnProvider[] {
  const out: ColumnProvider[] = [];
  walkTree(accessor, out);
  return out;
}

function walkTree(node: TreeNodeAccessor, out: ColumnProvider[]): void {
  const typeName = node.resourceType.name as ValueOf<typeof ResourceTypeName>;

  if (typeName === ResourceTypeName.PFrame) {
    out.push(new OutputColumnProvider(node));
    return;
  }

  if (typeName === ResourceTypeName.StdMap || typeName === ResourceTypeName.StdMapSlash) {
    for (const field of node.listOutputFields()) {
      const child = node.resolveOutput(field);
      if (child) walkTree(child, out);
    }
  }
}
