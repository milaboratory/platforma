import type { PColumnSpec, PObjectId } from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render/accessor";
import type { RenderCtxBase, ResultPool } from "../render";
import type { ColumnSnapshot } from "./column_snapshot";
import type { ColumnDataStatus } from "./column_snapshot";
import type { ColumnSnapshotProvider } from "./column_snapshot_provider";
import { OutputColumnProvider } from "./column_snapshot_provider";
import { ResourceTypeName } from "@milaboratories/pl-model-common";
import type { ValueOf } from "@milaboratories/helpers";

/**
 * Collect ColumnSnapshotProviders from all render context sources:
 *
 * - **resultPool** — all upstream columns (always included)
 * - **outputs** — PFrame fields from block execution outputs
 * - **prerun** — PFrame fields from prerun/staging results
 *
 * Returns an array of providers suitable for `ColumnCollectionBuilder.addSource()`.
 */
export function collectCtxColumnSnapshotProviders<A, U>(
  ctx: RenderCtxBase<A, U>,
): ColumnSnapshotProvider[] {
  const providers: ColumnSnapshotProvider[] = [];

  // ResultPool — all upstream columns
  providers.push(new ResultPoolColumnSnapshotProvider(ctx.resultPool));

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
 * Adapter wrapping ResultPool into the new ColumnSnapshotProvider interface.
 *
 * - `isColumnListComplete()` always returns true — the result pool
 *   is a stable snapshot within a single render cycle.
 * - Data status is derived from the underlying TreeNodeAccessor:
 *   ready (getIsReadyOrError), computing, or absent (no data resource).
 */
export class ResultPoolColumnSnapshotProvider implements ColumnSnapshotProvider {
  constructor(private readonly pool: ResultPool) {}

  getAllColumns(): ColumnSnapshot<PObjectId>[] {
    const pColumns = this.pool.selectColumns(() => true);
    return pColumns.map((col) => toSnapshot(col.id, col.spec, col.data));
  }

  isColumnListComplete(): boolean {
    return true;
  }
}

function toSnapshot(
  id: PObjectId,
  spec: PColumnSpec,
  accessor: TreeNodeAccessor | undefined,
): ColumnSnapshot<PObjectId> {
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
function collectPFrameProviders(accessor: TreeNodeAccessor): ColumnSnapshotProvider[] {
  const out: ColumnSnapshotProvider[] = [];
  walkTree(accessor, out);
  return out;
}

function walkTree(node: TreeNodeAccessor, out: ColumnSnapshotProvider[]): void {
  const typeName = node.resourceType.name as ValueOf<typeof ResourceTypeName>;

  if (typeName === ResourceTypeName.PFrame) {
    out.push(new OutputColumnProvider(node));
    return;
  }

  if (typeName === ResourceTypeName.StdMap || typeName === ResourceTypeName.StdMapSlash) {
    for (const field of node.listInputFields()) {
      const child = node.resolve(field);
      if (child) walkTree(child, out);
    }
  }
}
