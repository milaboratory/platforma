import {
  Annotation,
  isColumnDiscoveredId,
  isGlobalPObjectId,
  parseColumnDiscoveredId,
} from "@milaboratories/pl-model-common";
import type {
  ColumnsCollectionDriverModel,
  ColumnUniversalId,
  MultiColumnSelector,
  PColumnSpec,
  PObjectSpec,
} from "@milaboratories/pl-model-common";
import type { ColumnRecipe, ColumnsSource, ColumnsSourceShorthand } from "../../columns";
import {
  hasSingleDataColumn,
  ColumnsCollection,
  hitQualifications,
  collectLinkerColumns,
  queriesQualifications,
} from "../../columns";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
  type Entry,
} from "../../labels/derive_distinct_labels";
import type { DatasetEnrichment } from "./dataset_selection";

export interface FindEnrichmentColumnsOptions {
  sources: ReadonlyArray<ColumnsCollection | ColumnsSource | ColumnsSourceShorthand>;
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
 *
 * A hit is kept only when a workflow can find it by its id: the hit and every
 * linker leading to it are block outputs.
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
    if (hasSingleDataColumn(v)) return false;
    if (!reachesBlockOutputs(v.id)) return false;
    return predicate === undefined || predicate(v.getSpec());
  });
}

/**
 * Pairs each column with a label that tells apart the same hit reached through
 * different linkers, so export headers stay unique.
 */
export function labelEnrichments(
  variants: ColumnRecipe[],
  labelOptions?: DeriveLabelsOptions,
): DatasetEnrichment[] {
  if (variants.length === 0) return [];

  const entries: Entry[] = variants.map((variant) => ({
    spec: variant.getSpec(),
    linkerPath: collectLinkerColumns(variant).map((linker) => ({ spec: linker.getSpec() })),
    qualifications: {
      forHit: [...hitQualifications(variant)],
      forQueries: queriesQualifications(variant),
    },
  }));
  const labels = deriveDistinctLabels(entries, labelOptions);

  return variants.map((variant, i): DatasetEnrichment => ({ id: variant.id, label: labels[i] }));
}

// Internals

function reachesBlockOutputs(id: ColumnUniversalId): boolean {
  if (!isColumnDiscoveredId(id)) return false;
  const key = parseColumnDiscoveredId(id);
  return [key.column, ...(key.path ?? []).map((step) => step.column)].every(isGlobalPObjectId);
}
