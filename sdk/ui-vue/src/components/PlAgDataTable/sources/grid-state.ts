import { isJsonEqual } from "@milaboratories/helpers";
import type { PlDataTableGridStateCore, PlTableColumnIdJson } from "@platforma-sdk/model";

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
 * Whether the grid already shows everything the stored state asks for that it
 * could possibly show.
 *
 * The comparison decides whether to destroy and rebuild the grid around the
 * stored state, so it must only ever ask for things a rebuild can deliver.
 * Two kinds of request cannot be:
 *
 * - a field the stored state does not express. AG Grid always reports its whole
 *   state, and a state saved while the grid had no columns carries no
 *   `columnOrder` at all; demanding equality there asks the grid to unreport
 *   something.
 * - an id the grid does not have. State outlives column sets — a sort on a
 *   column a later run dropped, hidden ids from a table with different columns —
 *   and no rebuild brings those columns back.
 *
 * Asking anyway is how this watch became an engine for infinite rebuilds, so
 * both are filtered out before comparing rather than guarded against afterwards.
 */
export function storedStateApplied(
  stored: PlDataTableGridStateCore,
  self: PlDataTableGridStateCore,
  gridColIds: ReadonlySet<PlTableColumnIdJson>,
): boolean {
  const want = stateForReloadCompare(reachable(stored, gridColIds));
  const have = stateForReloadCompare(self);

  if (want.columnVisibility !== undefined) {
    // A set, not a list: the grid is free to report it in any order.
    const wantHidden = [...want.columnVisibility.hiddenColIds].sort();
    const haveHidden = [...(have.columnVisibility?.hiddenColIds ?? [])].sort();
    if (!isJsonEqual(wantHidden, haveHidden)) return false;
  }

  if (want.sort !== undefined && !isJsonEqual(want.sort, have.sort)) return false;

  if (want.columnOrder !== undefined) {
    // Only the relative order of the columns the stored state knows about: the
    // grid may hold others, and where it puts them is not being asked about.
    const asked = new Set(want.columnOrder.orderedColIds);
    const haveOrder = (have.columnOrder?.orderedColIds ?? []).filter((id) => asked.has(id));
    if (!isJsonEqual(want.columnOrder.orderedColIds, haveOrder)) return false;
  }

  return true;
}

/** The stored state with every reference to a column the grid does not have removed. */
function reachable(
  state: PlDataTableGridStateCore,
  gridColIds: ReadonlySet<PlTableColumnIdJson>,
): PlDataTableGridStateCore {
  const known = (id: PlTableColumnIdJson) => gridColIds.has(id);
  const order = state.columnOrder?.orderedColIds.filter(known) ?? [];
  return {
    columnOrder: order.length > 0 ? { orderedColIds: order } : undefined,
    columnVisibility: state.columnVisibility && {
      hiddenColIds: state.columnVisibility.hiddenColIds.filter(known),
    },
    sort: state.sort && { sortModel: state.sort.sortModel.filter((s) => known(s.colId)) },
  };
}
