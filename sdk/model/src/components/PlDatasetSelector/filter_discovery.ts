import { Annotation } from "@milaboratories/pl-model-common";
import type { Option, PlRef, PObjectId, PObjectSpec } from "@milaboratories/pl-model-common";
import canonicalize from "canonicalize";
import type {
  AnchoredColumnCollection,
  ColumnMatch,
} from "../../columns/column_collection_builder";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
  type Entry,
} from "../../labels/derive_distinct_labels";

/**
 * Columns annotated `pl7.app/isSubset: "true"` whose axes ⊆ anchor axes.
 * The axes-subset constraint comes from `mode: "enrichment"`.
 */
export function findFilterColumns(collection: AnchoredColumnCollection): ColumnMatch[] {
  return collection.findColumns({
    mode: "enrichment",
    include: {
      annotations: { [Annotation.IsSubset]: "true" },
    },
  });
}

export type FilterMatchOptions = {
  /** Maps result-pool column id back to its source PlRef (see {@link buildRefMap}). */
  refsByObjectId: ReadonlyMap<PObjectId, PlRef>;
  /** Spec of the dataset the filters are subsets of. */
  datasetSpec: PObjectSpec;
  /**
   * Forwarded to `deriveDistinctLabels`. Any `formatters.native` caller
   * sets is silently overridden — the function relies on a no-op native
   * formatter to keep the algorithm from short-circuiting on filters'
   * inherited `pl7.app/label`.
   */
  labelOptions?: DeriveLabelsOptions;
};

/**
 * Derive labels for filter column matches (for `DatasetOption.filters`).
 * Matches whose column id is missing from `refsByObjectId` are silently
 * dropped — they cannot be exposed as selectable options.
 */
export function filterMatchesToOptions(
  matches: ColumnMatch[],
  options: FilterMatchOptions,
): Option[] {
  if (matches.length === 0) return [];

  const { refsByObjectId, datasetSpec, labelOptions } = options;

  // One entry per match-variant (different paths to the same column are
  // exposed as separate Options). The `ref` field rides along on the
  // Entry-shaped objects via structural typing; `deriveDistinctLabels`
  // ignores extra fields.
  const entries = matches.flatMap((match): (Entry & { ref: PlRef })[] => {
    const ref = refsByObjectId.get(match.column.id);
    if (ref === undefined) return [];
    return match.variants.map((variant) => ({
      ref,
      spec: match.column.spec,
      linkerPath: variant.path.map((p) => ({ spec: p.linker.spec })),
    }));
  });

  // Appending the dataset forces a discriminating trace step into every
  // filter label (yielding e.g. "Bulk / Top 10"); the dataset's own label
  // is dropped because we only zip `entries`. Native label is force-
  // suppressed (the override sits after caller's spread) — filters
  // inherit the dataset's `pl7.app/label` and would otherwise satisfy
  // uniqueness before any trace step is consulted.
  const labels = deriveDistinctLabels([...entries, { spec: datasetSpec }], {
    ...labelOptions,
    formatters: { ...labelOptions?.formatters, native: () => undefined },
  });

  return entries.map(({ ref }, i) => ({ ref, label: labels[i] }));
}

/** Build the `refsByObjectId` map from `ctx.resultPool.getSpecs().entries`. */
export function buildRefMap(entries: readonly { readonly ref: PlRef }[]): Map<PObjectId, PlRef> {
  return new Map(entries.map((e) => [canonicalize(e.ref)! as PObjectId, e.ref]));
}
