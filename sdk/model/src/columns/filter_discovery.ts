import { Annotation } from "@milaboratories/pl-model-common";
import type { AnchoredColumnCollection, ColumnMatch } from "./column_collection_builder";

/**
 * Find filter columns compatible with the collection's anchors.
 * Matches columns with `pl7.app/isSubset: "true"` annotation
 * whose axes are a subset of the anchor axes (enrichment mode).
 */
export function findFilterColumns(collection: AnchoredColumnCollection): ColumnMatch[] {
  return collection.findColumns({
    mode: "enrichment",
    include: {
      annotations: { [Annotation.IsSubset]: "true" },
    },
  });
}
