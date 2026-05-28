import type { MultiColumnSelector, Option, PObjectSpec } from "@milaboratories/pl-model-common";
import { multiColumnSelectorsToPredicate } from "@milaboratories/pl-model-common";
import type { DeriveLabelsOptions } from "../../labels/derive_distinct_labels";
import type { RenderCtxBase } from "../../render";
import type { DatasetOption } from "./dataset_selection";
import { buildRefMap, filterMatchesToOptions, findFilterColumns } from "./filter_discovery";
import { enrichmentVariantsToRefs, findEnrichmentColumns } from "./enrichment_discovery";
import { ColumnsProvider, getCtxProviders } from "../../columns";

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
  /**
   * Formatting options forwarded to label derivation for both filter and
   * enrichment rows. `formatters.native` on the filter path is overridden
   * — see `FilterMatchOptions.labelOptions`.
   */
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

  const withEnrichments = opts?.withEnrichments ?? false;
  const filterSource = ColumnsProvider(ctx.ctx.getUpstreamBlockCtx());
  // Hoist providers once: getCtxProviders walks the full output tree, so
  // calling it per dataset option would be O(N × tree).
  const enrichmentSources = withEnrichments ? getCtxProviders(ctx) : undefined;

  return options.map((primary: Option): DatasetOption => {
    const datasetSpec = ctx.resultPool.getPColumnSpecByRef(primary.ref);
    if (!datasetSpec) return { primary };

    // ResultPoolColumnsProvider's completeness is per-block; allowPartialColumnList
    // tells discoverColumns to return partial results while pool entries flap.
    const filterMatches = findFilterColumns({
      sources: [filterSource],
      anchorSpec: datasetSpec,
    }).filter((m) => filterPredicate(m.getSpec()!));

    const filters =
      filterMatches.length === 0
        ? undefined
        : filterMatchesToOptions(filterMatches, {
            refsByObjectId: refMap,
            datasetSpec,
            labelOptions: opts?.labelOptions,
          });

    let enrichments;
    if (enrichmentSources && withEnrichments) {
      const enrichmentVariants = findEnrichmentColumns({
        sources: enrichmentSources,
        anchorSpec: datasetSpec,
        maxHops: opts?.enrichmentMaxHops,
        ...(typeof withEnrichments === "function"
          ? { predicate: withEnrichments }
          : { include: withEnrichments }),
      });
      if (enrichmentVariants.length > 0) {
        enrichments = enrichmentVariantsToRefs(enrichmentVariants, opts?.labelOptions);
      }
    }

    return {
      primary,
      ...(filters !== undefined && filters.length > 0 ? { filters } : {}),
      ...(enrichments !== undefined && enrichments.length > 0 ? { enrichments } : {}),
    };
  });
}
