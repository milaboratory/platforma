import type {
  FilterSpec,
  FilterSpecLeaf,
  FilterSpecNode,
  InferFilterSpecLeafColumn,
} from "@milaboratories/pl-model-common";
import type {
  InferFilterSpecCommonLeaf,
  InferFilterSpecLeaf,
} from "@milaboratories/pl-model-common";

export type FilterSpecVisitor<LeafArg, R> = {
  /** Handle a leaf filter node. */
  leaf: (leaf: LeafArg) => R;
  /** Handle an AND node after children have been traversed. */
  and: (results: R[]) => R;
  /** Handle an OR node after children have been traversed. */
  or: (results: R[]) => R;
  /** Handle a NOT node after the inner filter has been traversed. */
  not: (result: R) => R;
};

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
export function traverseFilterSpec<
  F extends FilterSpec<FilterSpecLeaf<unknown>, unknown, unknown>,
  R,
>(
  filter: F,
  visitor: FilterSpecVisitor<InferFilterSpecCommonLeaf<F> & InferFilterSpecLeaf<F>, R>,
): R {
  return traverseFilterSpecImpl(filter, visitor as FilterSpecVisitor<unknown, R>);
}
/** Internal implementation with simple generics for clean recursion. */
function traverseFilterSpecImpl<R>(
  filter: FilterSpecNode<FilterSpecLeaf<unknown>, unknown, unknown>,
  visitor: FilterSpecVisitor<unknown, R>,
): R {
  switch (filter.type) {
    case "and":
      return visitor.and(
        filter.filters
          .filter((f) => f.type !== undefined)
          .map((f) => traverseFilterSpecImpl(f, visitor)),
      );
    case "or":
      return visitor.or(
        filter.filters
          .filter((f) => f.type !== undefined)
          .map((f) => traverseFilterSpecImpl(f, visitor)),
      );
    case "not":
      return visitor.not(traverseFilterSpecImpl(filter.filter, visitor));
    default:
      return visitor.leaf(filter);
  }
}

/** Collects all column references (`column` and `rhs` fields) from filter leaves. */
export function collectFilterSpecColumns<
  F extends FilterSpec<FilterSpecLeaf<unknown>, unknown, unknown>,
  R extends InferFilterSpecLeafColumn<F> = InferFilterSpecLeafColumn<F>,
>(filter: F): R[] {
  return traverseFilterSpec(filter, {
    leaf: (leaf) => {
      const cols: R[] = [];
      if ("column" in leaf && leaf.column !== undefined) cols.push(leaf.column as R);
      if ("rhs" in leaf && leaf.rhs !== undefined) cols.push(leaf.rhs as R);
      return cols;
    },
    and: (results) => results.flat(),
    or: (results) => results.flat(),
    not: (result) => result,
  });
}
