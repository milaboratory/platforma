import { isJsonEqual } from "@milaboratories/helpers";
import type { PlDataTableGridStateCore } from "@platforma-sdk/model";

/**
 * Normalize for comparison: an absent and an empty columnVisibility / sort mean
 * the same thing to AG Grid, and must not count as a state change to reload on.
 */
export function stateForReloadCompare(state: PlDataTableGridStateCore): PlDataTableGridStateCore {
  const cv = state.columnVisibility;
  const normalizedCv = !cv || cv.hiddenColIds.length === 0 ? undefined : state.columnVisibility;
  const sort = state.sort;
  const normalizedSort = !sort || sort.sortModel.length === 0 ? undefined : sort;
  return { ...state, columnVisibility: normalizedCv, sort: normalizedSort };
}

/**
 * Whether the grid already shows everything the stored state asks for.
 *
 * The stored state is a partial opinion — one saved while the grid had no
 * columns carries no `columnOrder` at all — while AG Grid always reports its
 * whole state. So only a field the stored state actually expresses can be in
 * disagreement: demanding equality on the rest asks the grid to unreport
 * something it cannot, and no remount could ever satisfy it.
 */
export function storedStateApplied(
  stored: PlDataTableGridStateCore,
  self: PlDataTableGridStateCore,
): boolean {
  const want = stateForReloadCompare(stored);
  const have = stateForReloadCompare(self);
  return (Object.keys(want) as (keyof PlDataTableGridStateCore)[]).every(
    (field) => want[field] === undefined || isJsonEqual(want[field], have[field]),
  );
}
