import { Annotation } from "@milaboratories/pl-model-common";
import type { Option, PlRef, PObjectId } from "@milaboratories/pl-model-common";
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
 * Matches columns annotated `pl7.app/isSubset: "true"` whose axes ⊆ anchor axes.
 *
 * The axes-subset constraint is enforced by `mode: "enrichment"`, which sets
 * `allowFloatingHitAxes: false` — every axis of the matched column must be
 * present in the anchor's axes. See `matchingModeToConstraints()` in
 * `column_collection_builder.ts`.
 */
export function findFilterColumns(collection: AnchoredColumnCollection): ColumnMatch[] {
  return collection.findColumns({
    mode: "enrichment",
    include: {
      annotations: { [Annotation.IsSubset]: "true" },
    },
  });
}

/**
 * Derive labeled options from filter column matches, for use in DatasetOption.filters.
 *
 * @param matches - from findFilterColumns()
 * @param refsByObjectId - from {@link buildRefMap}
 * @param labelOptions - forwarded to deriveDistinctLabels()
 */
export function filterMatchesToOptions(
  matches: ColumnMatch[],
  refsByObjectId: ReadonlyMap<PObjectId, PlRef>,
  labelOptions?: DeriveLabelsOptions,
): Option[] {
  if (matches.length === 0) return [];

  // Each ColumnMatch can be reached via multiple variants (different linker
  // paths / qualifications). We emit one Option per variant so the user can
  // pick a specific path — `deriveDistinctLabels` disambiguates labels by
  // path.
  const flattened = matches.flatMap((m) => m.variants.map((v) => ({ match: m, variant: v })));

  const entries: Entry[] = flattened.map(({ match, variant }) => ({
    spec: match.column.spec,
    linkerPath: variant.path.map((p) => ({ spec: p.linker.spec })),
  }));

  const labels = deriveDistinctLabels(entries, labelOptions);

  return flattened.map(({ match }, i) => {
    const ref = refsByObjectId.get(match.column.id);
    if (ref === undefined)
      throw new Error(
        `no PlRef found for filter column ${match.column.spec.name} (id: ${match.column.id})`,
      );
    return { ref, label: labels[i] };
  });
}

/**
 * Usage: `buildRefMap(ctx.resultPool.getSpecs().entries)`
 */
export function buildRefMap(entries: readonly { readonly ref: PlRef }[]): Map<PObjectId, PlRef> {
  const map = new Map<PObjectId, PlRef>();
  for (const entry of entries) {
    map.set(canonicalize(entry.ref)! as PObjectId, entry.ref);
  }
  return map;
}
