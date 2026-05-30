import type { PlTableColumnIdJson } from "@platforma-sdk/model";

/** A grid column reduced to what visibility-deviation derivation needs. */
export type ColumnVisibilityState = {
  colId: PlTableColumnIdJson;
  /** Current visibility in the grid. */
  hidden: boolean;
  /** Block-defined default visibility: `pl7.app/table/visibility` = "optional". */
  optional: boolean;
};

/**
 * Derive the user's explicit visibility overrides (deviations from the block default)
 * from the live grid columns. This is the inverse of the hide decision in
 * `makeColDef` / `resolveColumnHidden`: only genuine deviations are recorded, so an
 * untouched column always follows its CURRENT default — including when that default
 * flips between runs (the MILAB-6002 fix). Persisting deviations rather than the
 * absolute hidden set is what keeps saved state stable across re-runs.
 *
 * Callers pass real columns only. Axes and the row-number column have no
 * `pl7.app/table/visibility` default, so their manual show/hide is intentionally
 * not persisted and they must be excluded by the caller.
 */
export function computeVisibilityDeviations(columns: ColumnVisibilityState[]): {
  hiddenColIds: PlTableColumnIdJson[];
  shownColIds: PlTableColumnIdJson[];
} {
  const hiddenColIds: PlTableColumnIdJson[] = [];
  const shownColIds: PlTableColumnIdJson[] = [];
  for (const c of columns) {
    if (c.hidden && !c.optional) hiddenColIds.push(c.colId);
    else if (!c.hidden && c.optional) shownColIds.push(c.colId);
  }
  return { hiddenColIds, shownColIds };
}
