import type { FilterSpecLeaf, FilterSpecNode } from "@milaboratories/pl-model-common";

/**
 * Recursively traverses a FilterSpec tree bottom-up, applying visitor callbacks.
 *
 * Entries with `{ type: undefined }` inside `and`/`or` arrays are skipped
 * (these represent unfilled filter slots in the UI).
 *
 * Traversal order:
 * 1. Recurse into child filters (`and`/`or`/`not`)
 * 2. Apply the corresponding visitor callback with already-traversed children
 * 3. For leaf nodes, call `leaf` directly
 */
export function traverseFilterSpec<Leaf extends FilterSpecLeaf<unknown>, CommonNode, CommonLeaf, R>(
  filter: FilterSpecNode<Leaf, CommonNode, CommonLeaf>,
  visitor: {
    /** Handle a leaf filter node. */
    leaf: (leaf: CommonLeaf & Leaf) => R;
    /** Handle an AND node after children have been traversed. */
    and: (results: R[]) => R;
    /** Handle an OR node after children have been traversed. */
    or: (results: R[]) => R;
    /** Handle a NOT node after the inner filter has been traversed. */
    not: (result: R) => R;
  },
): R {
  switch (filter.type) {
    case "and":
      return visitor.and(
        filter.filters
          .filter((f) => f.type !== undefined)
          .map((f) => traverseFilterSpec(f, visitor)),
      );
    case "or":
      return visitor.or(
        filter.filters
          .filter((f) => f.type !== undefined)
          .map((f) => traverseFilterSpec(f, visitor)),
      );
    case "not":
      return visitor.not(traverseFilterSpec(filter.filter, visitor));
    default:
      return visitor.leaf(filter as CommonLeaf & Leaf);
  }
}

/** Collects all column references (`column` and `rhs` fields) from filter leaves. */
export function collectFilterSpecColumns<
  Leaf extends FilterSpecLeaf<unknown>,
  CommonNode,
  CommonLeaf,
>(filter: FilterSpecNode<Leaf, CommonNode, CommonLeaf>): string[] {
  return traverseFilterSpec(filter, {
    leaf: (leaf) => {
      const cols: string[] = [];
      if ("column" in leaf && leaf.column !== undefined) cols.push(leaf.column as string);
      if ("rhs" in leaf && leaf.rhs !== undefined) cols.push(leaf.rhs as string);
      return cols;
    },
    and: (results) => results.flat(),
    or: (results) => results.flat(),
    not: (result) => result,
  });
}
