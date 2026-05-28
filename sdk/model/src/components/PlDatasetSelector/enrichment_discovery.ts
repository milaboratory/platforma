import {
  Annotation,
  createEnrichmentRef,
  extractPObjectId,
  isGlobalPObjectId,
} from "@milaboratories/pl-model-common";
import type {
  ColumnsCollectionDriverModel,
  EnrichmentStep,
  LabeledEnrichmentRef,
  LabeledEnrichmentRefs,
  MultiColumnSelector,
  PColumnSpec,
  PObjectSpec,
} from "@milaboratories/pl-model-common";
import type { ColumnRecipe, ColumnsSource } from "../../columns";
import {
  isLeafColumn,
  ColumnsCollection,
  collectLinkerIds,
  hitQualifications,
  collectLinkerColumns,
  queriesQualifications,
} from "../../columns";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
  type Entry,
} from "../../labels/derive_distinct_labels";

export interface FindEnrichmentColumnsOptions {
  sources: ReadonlyArray<ColumnsSource>;
  anchorSpec: PColumnSpec;
  maxHops?: number;
  include?: MultiColumnSelector | MultiColumnSelector[];
  predicate?: (spec: PObjectSpec) => boolean;
  /** Override the resolved `columnsCollection` service (primarily for tests). */
  driver?: ColumnsCollectionDriverModel;
}

/**
 * Linker-reached hits attached to the anchor primary. Drops zero-hop variants
 * (filters / the primary itself) and structural hits (subset, linker, label
 * columns). Narrow further with `include` selectors or a `predicate`.
 */
export function findEnrichmentColumns(options: FindEnrichmentColumnsOptions): ColumnRecipe[] {
  const include =
    options.include === undefined
      ? undefined
      : Array.isArray(options.include)
        ? options.include
        : [options.include];

  const columns = ColumnsCollection([...options.sources], { driver: options.driver })
    .discover({
      anchors: { main: options.anchorSpec },
      mode: "enrichment",
      maxHops: options.maxHops ?? 4,
      include,
      exclude: [
        { annotations: { [Annotation.IsSubset]: "true" } },
        { annotations: { [Annotation.IsLinkerColumn]: "true" } },
        { name: Annotation.Label },
      ],
    })
    .getColumns();

  const predicate = options.predicate;
  return columns.filter((v) => {
    if (isLeafColumn(v)) return false;
    if (predicate !== undefined && !predicate(v.getSpec())) return false;
    if (!isGlobalPObjectId(extractPObjectId(v.id))) return false;
    if (collectLinkerIds(v).some((id) => !isGlobalPObjectId(id))) return false;
    return true;
  });
}

/**
 * Pair each variant with a path-disambiguated label (so export headers stay
 * unique) and carry hit/linker `PObjectId`s through verbatim. Propagates
 * `qualifications.forHit`; `forQueries` is re-derived by the table builder.
 */
export function enrichmentVariantsToRefs(
  variants: ColumnRecipe[],
  labelOptions?: DeriveLabelsOptions,
): LabeledEnrichmentRefs {
  if (variants.length === 0) return [];

  const linkerIdsByVariant = variants.map((v) => collectLinkerIds(v));
  const hitQualsByVariant = variants.map((v) => [...hitQualifications(v)]);

  const entries: Entry[] = variants.map((variant, i) => ({
    spec: variant.getSpec(),
    linkerPath: collectLinkerColumns(variant).map((linker) => ({ spec: linker.getSpec() })),
    qualifications: {
      forHit: hitQualsByVariant[i],
      forQueries: queriesQualifications(variant),
    },
  }));
  const labels = deriveDistinctLabels(entries, labelOptions);

  return variants.map((variant, i): LabeledEnrichmentRef => {
    const path: undefined | EnrichmentStep[] =
      linkerIdsByVariant[i].length === 0
        ? undefined
        : linkerIdsByVariant[i].map((id) => ({ type: "linker", linker: id }));
    return {
      ref: createEnrichmentRef(extractPObjectId(variant.id), {
        path,
        qualifications: hitQualsByVariant[i],
      }),
      label: labels[i],
    };
  });
}
