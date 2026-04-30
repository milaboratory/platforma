import type { MultiColumnSelector, Option, PObjectSpec } from "@milaboratories/pl-model-common";
import { multiColumnSelectorsToPredicate } from "@milaboratories/pl-model-common";
import type { DeriveLabelsOptions } from "../../labels/derive_distinct_labels";
import type { RenderCtxBase } from "../../render";
import { ColumnCollectionBuilder } from "../../columns/column_collection_builder";
import { collectCtxColumnSnapshotProviders } from "../../columns/ctx_column_sources";
import type { DatasetOption } from "./dataset_selection";
import { buildRefMap, filterMatchesToOptions, findFilterColumns } from "./filter_discovery";
import { enrichmentVariantsToRefs, findEnrichmentColumns } from "./enrichment_discovery";

export type BuildDatasetOptions = {
  /** Which result pool columns qualify as datasets. Defaults to all. */
  primary?: MultiColumnSelector | MultiColumnSelector[] | ((spec: PObjectSpec) => boolean);
  /** Formatting options for filter labels. */
  labelOptions?: DeriveLabelsOptions;
  /**
   * Enables enrichment discovery and filters hits attached to
   * `DatasetOption.enrichments`. Use `() => true` to accept all; omit to disable.
   */
  withEnrichments?: MultiColumnSelector | MultiColumnSelector[] | ((spec: PObjectSpec) => boolean);
  /** Maximum linker hops considered. Only used when `withEnrichments` is set. */
  enrichmentMaxHops?: number;
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
  const primary = opts?.primary;
  const primaryPredicate =
    primary === undefined
      ? () => true
      : typeof primary === "function"
        ? primary
        : multiColumnSelectorsToPredicate(primary);
  const options = ctx.resultPool.getOptions(primaryPredicate, { refsWithEnrichments: true });
  if (options.length === 0) return [];

  const columnSources = collectCtxColumnSnapshotProviders(ctx);
  const refMap = buildRefMap(ctx.resultPool.getSpecs().entries);
  const pframeSpec = ctx.getService("pframeSpec");

  return options.map((primary: Option): DatasetOption => {
    const datasetSpec = ctx.resultPool.getPColumnSpecByRef(primary.ref);
    if (!datasetSpec) return { primary };

    const builder = new ColumnCollectionBuilder(pframeSpec);
    for (const src of columnSources) builder.addSource(src);
    const collection = builder.build({ anchors: { main: datasetSpec } });
    if (!collection) return { primary };

    try {
      const filterMatches = findFilterColumns(collection);
      const filters =
        filterMatches.length === 0
          ? undefined
          : filterMatchesToOptions(filterMatches, refMap, opts?.labelOptions);

      let enrichments;
      if (opts?.withEnrichments !== undefined) {
        const enrichmentVariants = findEnrichmentColumns(collection, {
          maxHops: opts.enrichmentMaxHops,
          ...(typeof opts.withEnrichments === "function"
            ? { predicate: opts.withEnrichments }
            : { include: opts.withEnrichments }),
        });
        if (enrichmentVariants.length > 0) {
          enrichments = enrichmentVariantsToRefs(enrichmentVariants, opts.labelOptions);
        }
      }

      return {
        primary,
        ...(filters !== undefined && filters.length > 0 ? { filters } : {}),
        ...(enrichments !== undefined && enrichments.length > 0 ? { enrichments } : {}),
      };
    } finally {
      collection.dispose();
    }
  });
}
