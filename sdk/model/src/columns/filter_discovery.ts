import { Annotation } from "@milaboratories/pl-model-common";
import type { Option, PlRef, PObjectId } from "@milaboratories/pl-model-common";
import canonicalize from "canonicalize";
import type { AnchoredColumnCollection, ColumnMatch } from "./column_collection_builder";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
  type Entry,
} from "../labels/derive_distinct_labels";

/** Matches columns annotated `pl7.app/isSubset: "true"` whose axes ⊆ anchor axes. */
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

  const entries: Entry[] = matches.map((m) => ({
    spec: m.column.spec,
    linkerPath: m.path.map((p) => ({ spec: p.linker.spec })),
  }));

  const labels = deriveDistinctLabels(entries, labelOptions);

  return matches.map((m, i) => {
    const ref = refsByObjectId.get(m.originalId);
    if (ref === undefined)
      throw new Error(
        `no PlRef found for filter column ${m.column.spec.name} (originalId: ${m.originalId})`,
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
