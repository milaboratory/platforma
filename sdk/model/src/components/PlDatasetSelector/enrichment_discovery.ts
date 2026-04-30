import { Annotation, createEnrichmentRef } from "@milaboratories/pl-model-common";
import type {
  EnrichmentStep,
  LabeledEnrichmentRef,
  LabeledEnrichmentRefs,
  MultiColumnSelector,
  PObjectId,
  PObjectSpec,
} from "@milaboratories/pl-model-common";
import type {
  AnchoredColumnCollection,
  ColumnVariant,
} from "../../columns/column_collection_builder";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
  type Entry,
} from "../../labels/derive_distinct_labels";

/**
 * True for global-form ids — `canonicalize({__isRef: true, blockId, name})` —
 * which the workflow can resolve via bquery. Local-form ids (`resolvePath`)
 * fail this check and are excluded from auto-discovery; prerun/outputs hops
 * must be supplied as resolved `{spec, data}` instead.
 */
function isGloballyAddressable(id: PObjectId): boolean {
  try {
    const decoded = JSON.parse(id);
    return (
      typeof decoded === "object" &&
      decoded !== null &&
      decoded.__isRef === true &&
      typeof decoded.blockId === "string" &&
      typeof decoded.name === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Linker-reached hits attached to the anchor primary. Drops zero-hop variants
 * (filters / the primary itself) and structural hits (subset, linker, label
 * columns). Narrow further with `include` selectors or a `predicate`.
 */
export function findEnrichmentColumns(
  collection: AnchoredColumnCollection,
  options?: {
    maxHops?: number;
    include?: MultiColumnSelector | MultiColumnSelector[];
    predicate?: (spec: PObjectSpec) => boolean;
  },
): ColumnVariant[] {
  const include =
    options?.include === undefined
      ? undefined
      : Array.isArray(options.include)
        ? options.include
        : [options.include];
  const variants = collection.findColumnVariants({
    mode: "enrichment",
    maxHops: options?.maxHops ?? 4,
    include,
    exclude: [
      { annotations: { [Annotation.IsSubset]: "true" } },
      { annotations: { [Annotation.IsLinkerColumn]: "true" } },
      { name: Annotation.Label },
    ],
  });
  const predicate = options?.predicate;
  return variants.filter((v) => {
    if (v.path.length === 0) return false;
    if (predicate !== undefined && !predicate(v.column.spec)) return false;
    if (!isGloballyAddressable(v.column.id)) return false;
    if (v.path.some((p) => !isGloballyAddressable(p.linker.id))) return false;
    return true;
  });
}

/**
 * Pair each variant with a path-disambiguated label (so export headers stay
 * unique) and carry hit/linker `PObjectId`s through verbatim. Propagates
 * `qualifications.forHit`; `forQueries` is re-derived by the table builder.
 */
export function enrichmentVariantsToRefs(
  variants: ColumnVariant[],
  labelOptions?: DeriveLabelsOptions,
): LabeledEnrichmentRefs {
  if (variants.length === 0) return [];

  const entries: Entry[] = variants.map((variant) => ({
    spec: variant.column.spec,
    linkerPath: variant.path.map((p) => ({ spec: p.linker.spec })),
    qualifications: variant.qualifications,
  }));
  const labels = deriveDistinctLabels(entries, labelOptions);

  return variants.map((variant, i): LabeledEnrichmentRef => {
    const path: EnrichmentStep[] = variant.path.map((step) => ({
      type: "linker",
      linker: step.linker.id,
    }));
    return {
      ref: createEnrichmentRef(variant.column.id, {
        path,
        qualifications: variant.qualifications.forHit,
      }),
      label: labels[i],
    };
  });
}
