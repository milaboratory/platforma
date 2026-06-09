import type { PlDataTableGridStateCore, PlTableColumnIdJson } from "@platforma-sdk/model";

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
  // Canonical-sort so the same logical deviation set serialises identically
  // regardless of the live grid column order. The reload watch compares persisted
  // vs current state with the order-sensitive isJsonEqual, so an unsorted output
  // would make a pure column reorder look like a state change and fire a spurious
  // grid reload (lost scroll/selection).
  hiddenColIds.sort();
  shownColIds.sort();
  return { hiddenColIds, shownColIds };
}

/**
 * Reconcile the deviations derived from the live grid columns with the previously
 * persisted ones into the value to store in {@link PlDataTableGridStateCore.columnVisibility}.
 *
 * The grid is built without column defs and only receives them once
 * `calculateGridOptions` resolves; during that window (and on teardown) a grid state
 * event can fire while the grid reports zero columns. Deriving from an empty column
 * set there yields empty deviations, which — written back — would silently wipe the
 * user's saved show/hide. An empty live-column set means "grid not ready", not "user
 * cleared every override", so fall back to the prior persisted value. (MILAB-6002.)
 *
 * Otherwise: no deviations collapse to `undefined` (equivalent to "all columns follow
 * their default"), matching how the value is read back.
 */
export function deriveColumnVisibility(
  columns: ColumnVisibilityState[],
  prev: PlDataTableGridStateCore["columnVisibility"],
): PlDataTableGridStateCore["columnVisibility"] {
  if (columns.length === 0) return prev;
  const deviations = computeVisibilityDeviations(columns);
  return deviations.hiddenColIds.length === 0 && deviations.shownColIds.length === 0
    ? undefined
    : deviations;
}
