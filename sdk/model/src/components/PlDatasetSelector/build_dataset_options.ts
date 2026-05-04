import type { MultiColumnSelector, Option, PObjectSpec } from "@milaboratories/pl-model-common";
import { multiColumnSelectorsToPredicate } from "@milaboratories/pl-model-common";
import type { DeriveLabelsOptions } from "../../labels/derive_distinct_labels";
import type { RenderCtxBase } from "../../render";
import { ColumnCollectionBuilder } from "../../columns/column_collection_builder";
import {
  ResultPoolColumnSnapshotProvider,
  collectCtxColumnSnapshotProviders,
} from "../../columns/ctx_column_sources";
import type { DatasetOption } from "./dataset_selection";
import { buildRefMap, filterMatchesToOptions, findFilterColumns } from "./filter_discovery";
import { enrichmentVariantsToRefs, findEnrichmentColumns } from "./enrichment_discovery";

type SpecPredicateOption =
  | MultiColumnSelector
  | MultiColumnSelector[]
  | ((spec: PObjectSpec) => boolean);

function toPredicate(opt: SpecPredicateOption | undefined): (spec: PObjectSpec) => boolean {
  if (opt === undefined) return () => true;
  return typeof opt === "function" ? opt : multiColumnSelectorsToPredicate(opt);
}

export type BuildDatasetOptions = {
  /** Which result pool columns qualify as datasets. Defaults to all. */
  primary?: SpecPredicateOption;
  /**
   * Restricts which result pool columns are considered as filters. Intersected
   * with the built-in `pl7.app/isSubset: "true"` constraint. Defaults to
   * accept-all.
   */
  filter?: SpecPredicateOption;
  /** Formatting options for filter labels. */
  labelOptions?: DeriveLabelsOptions;
  /**
   * Enables enrichment discovery and filters hits attached to
   * `DatasetOption.enrichments`. Use `() => true` to accept all; omit to disable.
   */
  withEnrichments?: SpecPredicateOption;
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
  const primaryPredicate = toPredicate(opts?.primary);
  const filterPredicate = toPredicate(opts?.filter);

  const options = ctx.resultPool.getOptions(primaryPredicate, { refsWithEnrichments: true });
  if (options.length === 0) return [];

  const refMap = buildRefMap(ctx.resultPool.getSpecs().entries);
  const pframeSpec = ctx.getService("pframeSpec");

  return options.map((primary: Option): DatasetOption => {
    const datasetSpec = ctx.resultPool.getPColumnSpecByRef(primary.ref);
    if (!datasetSpec) return { primary };

    const enrichmentCollection = new ColumnCollectionBuilder(pframeSpec)
      .addSources(collectCtxColumnSnapshotProviders(ctx))
      .build({ anchors: { main: datasetSpec } });
    if (!enrichmentCollection) return { primary };

    const filterCollection = new ColumnCollectionBuilder(pframeSpec)
      .addSource(new ResultPoolColumnSnapshotProvider(ctx.resultPool))
      .build({ anchors: { main: datasetSpec } });

    try {
      let filters: Option[] | undefined;
      if (filterCollection) {
        const filterMatches = findFilterColumns(filterCollection).filter((m) =>
          filterPredicate(m.column.spec),
        );
        filters =
          filterMatches.length === 0
            ? undefined
            : filterMatchesToOptions(filterMatches, refMap, opts?.labelOptions);
      }

      let enrichments;
      if (opts?.withEnrichments !== undefined) {
        const enrichmentVariants = findEnrichmentColumns(enrichmentCollection, {
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
      enrichmentCollection.dispose();
      filterCollection?.dispose();
    }
  });
}
