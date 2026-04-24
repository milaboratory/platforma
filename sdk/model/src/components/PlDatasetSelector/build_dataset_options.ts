import type {
  DatasetOption,
  Option,
  PColumnSelector,
  PObjectSpec,
} from "@milaboratories/pl-model-common";
import type { DeriveLabelsOptions } from "../../labels/derive_distinct_labels";
import type { RenderCtxBase } from "../../render";
import { ColumnCollectionBuilder } from "../../columns/column_collection_builder";
import { collectCtxColumnSnapshotProviders } from "../../columns/ctx_column_sources";
import { buildRefMap, filterMatchesToOptions, findFilterColumns } from "./filter_discovery";

export type BuildDatasetOptions = {
  /** Which result pool columns qualify as datasets. Defaults to all. */
  selector?: PColumnSelector | PColumnSelector[] | ((spec: PObjectSpec) => boolean);
  /** Formatting options for filter labels. */
  labelOptions?: DeriveLabelsOptions;
};

/**
 * Usage:
 * ```ts
 * .output("datasetOptions", (ctx) => buildDatasetOptions(ctx))
 * ```
 */
export function buildDatasetOptions(
  ctx: RenderCtxBase,
  opts?: BuildDatasetOptions,
): DatasetOption[] | undefined {
  const predicate = opts?.selector ?? (() => true);
  const options = ctx.resultPool.getOptions(predicate, { refsWithEnrichments: true });
  if (options.length === 0) return [];

  const columnSources = collectCtxColumnSnapshotProviders(ctx);
  const refMap = buildRefMap(ctx.resultPool.getSpecs().entries);
  const pframeSpec = ctx.getService("pframeSpec");

  return options.map((o: Option): DatasetOption => {
    const datasetSpec = ctx.resultPool.getPColumnSpecByRef(o.ref);
    if (!datasetSpec) return o;

    const builder = new ColumnCollectionBuilder(pframeSpec);
    for (const src of columnSources) builder.addSource(src);
    const collection = builder.build({ anchors: { main: datasetSpec } });
    if (!collection) return o;

    try {
      const matches = findFilterColumns(collection);
      if (matches.length === 0) return o;
      const filters = filterMatchesToOptions(matches, refMap, opts?.labelOptions);
      return { ...o, filters };
    } finally {
      collection.dispose();
    }
  });
}
