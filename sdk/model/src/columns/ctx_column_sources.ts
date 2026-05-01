import type { PColumn } from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render/accessor";
import type { RenderCtxBase, ResultPool } from "../render";
import type { PColumnDataUniversal } from "../render/internal";
import type { ColumnProvider } from "./column_provider";
import { OutputColumnProvider } from "./column_provider";
import { ResourceTypeName } from "@milaboratories/pl-model-common";
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
export function collectCtxColumnProviders(ctx: RenderCtxBase): ColumnProvider[] {
  const providers: ColumnProvider[] = [];

  // ResultPool — all upstream columns
  providers.push(new ResultPoolColumnProvider(ctx.resultPool));

  // Outputs — each PFrame-like output field becomes a provider
  const outputs = ctx.outputs;
  if (outputs) {
    providers.push(...collectPFrameProviders(outputs));
  }

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
 *   is a stable view within a single render cycle.
 * - Data status is derived from the underlying TreeNodeAccessor:
 *   ready (getIsReadyOrError), computing, or absent (no data resource).
 */
export class ResultPoolColumnProvider implements ColumnProvider {
  constructor(private readonly pool: ResultPool) {}

  getAllColumns(): PColumn<PColumnDataUniversal | undefined>[] {
    return this.pool.selectColumns(() => true);
  }

  isColumnListComplete(): boolean {
    return true;
  }
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
    for (const field of node.listInputFields()) {
      const child = node.resolve(field);
      if (child) walkTree(child, out);
    }
  }
}
