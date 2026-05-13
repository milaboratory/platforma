import { Annotation } from "@milaboratories/pl-model-common";
import type { Option, PlRef, PObjectId, PObjectSpec } from "@milaboratories/pl-model-common";
import canonicalize from "canonicalize";
import type {
  AnchoredColumnCollection,
  ColumnMatch,
} from "../../columns/column_collection_builder";
import { deriveDistinctLabels, type Entry } from "../../labels/derive_distinct_labels";

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

  // Refs and entries are built in parallel so the ref stays out of the
  // labeling input. One Option per match-variant.
  const { refsByObjectId, datasetSpec } = options;
  const refs: PlRef[] = [];
  const entries: Entry[] = [];
  for (const match of matches) {
    const ref = refsByObjectId.get(match.column.id);
    if (ref === undefined) continue;
    for (const variant of match.variants) {
      refs.push(ref);
      entries.push({
        spec: match.column.spec,
        linkerPath: variant.path.map((p) => ({ spec: p.linker.spec })),
      });
    }
  }

  // Appending the dataset forces a discriminating trace step into every
  // filter label (yielding e.g. "Bulk / Top 10"); the dataset's own label
  // is dropped by indexing only `refs`. Native label is suppressed because
  // filters inherit the dataset's `pl7.app/label` (often generic) and it
  // would otherwise satisfy uniqueness before any trace step is consulted.
  const allLabels = deriveDistinctLabels([...entries, { spec: datasetSpec }], {
    formatters: { native: () => undefined },
  });

  return refs.map((ref, i) => ({ ref, label: allLabels[i] }));
}

/** Build the `refsByObjectId` map from `ctx.resultPool.getSpecs().entries`. */
export function buildRefMap(entries: readonly { readonly ref: PlRef }[]): Map<PObjectId, PlRef> {
  const map = new Map<PObjectId, PlRef>();
  for (const entry of entries) {
    map.set(canonicalize(entry.ref)! as PObjectId, entry.ref);
  }
  return map;
}
