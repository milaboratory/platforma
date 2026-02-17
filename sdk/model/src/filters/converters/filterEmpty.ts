import { FilterSpec, FilterSpecLeaf } from "@milaboratories/pl-model-common";

export function filterPredicate(
  item: FilterSpec<FilterSpecLeaf<unknown>, unknown, unknown>,
): boolean {
  // No need to convert empty steps
  if (item.type == null) {
    return false;
  }

  if (item.type === "or") {
    return item.filters.length > 0;
  }

  if (item.type === "and") {
    return item.filters.length > 0;
  }

  if (item.type === "not") {
    return filterPredicate(item.filter);
  }

  // Filter out any item that has undefined values in required fields
  return !Object.values(item).some((v) => v === undefined);
}

export function filterEmptyPieces<T extends FilterSpec<FilterSpecLeaf<unknown>, unknown, unknown>>(
  item: T,
): null | T {
  if (item.type === "or" || item.type === "and") {
    const filtered = item.filters
      .map(filterEmptyPieces)
      .filter((f): f is T => f !== null && filterPredicate(f));

    return filtered.length === 0
      ? null
      : {
          ...item,
          filters: filtered,
        };
  }
  if (item.type === "not") {
    const inner = filterEmptyPieces(item.filter);
    return inner === null || !filterPredicate(inner)
      ? null
      : {
          ...item,
          filter: inner,
        };
  }

  if (!filterPredicate(item)) {
    return null;
  }

  return item;
}
