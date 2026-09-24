import { isJsonEqual } from "@milaboratories/helpers";
import type { PlDataTableGridStateCore, PlTableColumnIdJson } from "@platforma-sdk/model";

/**
 * Whether the grid already shows everything the stored state asks for that it
 * could possibly show.
 *
 * The answer decides whether to destroy and rebuild the grid around the stored
 * state, so it must only ever ask for things a rebuild can deliver. Two kinds of
 * request cannot be, and asking anyway is how this comparison became an engine
 * for endless rebuilds:
 *
 * - a field the stored state does not express. AG Grid always reports its whole
 *   state, and a state saved while the grid had no columns carries no
 *   `columnOrder` at all; demanding equality there asks the grid to unreport
 *   something.
 * - an id the grid does not have. State outlives column sets — a sort on a
 *   column a later run dropped, hidden ids saved against different columns — and
 *   no rebuild brings those columns back.
 *
 * Both are dropped before comparing rather than guarded against afterwards.
 */
export function isStoredStateApplied(
  desired: PlDataTableGridStateCore,
  actual: PlDataTableGridStateCore,
  gridColIds: ReadonlySet<PlTableColumnIdJson>,
): boolean {
  const want = reachableRequest(desired, gridColIds);
  const have = normalizeReportedState(actual);

  if (want.hiddenColIds !== undefined && !isJsonEqual(want.hiddenColIds, have.hiddenColIds))
    return false;

  if (want.sortModel !== undefined && !isJsonEqual(want.sortModel, have.sortModel)) return false;

  if (want.orderedColIds !== undefined) {
    // Only the relative order of the columns it names: the grid may hold others,
    // and where it puts them is not being asked about.
    const asked = new Set(want.orderedColIds);
    const inAskedOrder = have.orderedColIds.filter((id) => asked.has(id));
    if (!isJsonEqual(want.orderedColIds, inAskedOrder)) return false;
  }

  return true;
}

/**
 * Read a state the grid reported the way the grid means it.
 *
 * AG Grid leaves out what carries no information — no `sort` while nothing is
 * sorted, no `columnVisibility` while every column is shown — so absent and
 * empty mean the same thing coming from it, and hidden ids arrive in whatever
 * order it happens to hold them.
 *
 * The stored state is deliberately NOT read this way: there an empty list is the
 * user having cleared the sorting or shown every column, and the grid has to be
 * made to match it.
 */
function normalizeReportedState(state: PlDataTableGridStateCore) {
  return {
    orderedColIds: state.columnOrder?.orderedColIds ?? [],
    hiddenColIds: asSet(state.columnVisibility?.hiddenColIds ?? []),
    sortModel: state.sort?.sortModel ?? [],
  };
}

/** What the stored state asks for, with everything a rebuild could not deliver dropped. */
function reachableRequest(
  state: PlDataTableGridStateCore,
  gridColIds: ReadonlySet<PlTableColumnIdJson>,
) {
  const known = (id: PlTableColumnIdJson) => gridColIds.has(id);
  const hidden = askedFor(state.columnVisibility?.hiddenColIds, known);
  return {
    orderedColIds: askedFor(state.columnOrder?.orderedColIds, known),
    hiddenColIds: hidden && asSet(hidden),
    sortModel: askedFor(state.sort?.sortModel, (item) => known(item.colId)),
  };
}

/**
 * The entries the grid can still act on, or `undefined` when there is nothing to
 * ask for: either the field was never expressed, or every column it named is gone
 * and no rebuild brings those back. An explicitly empty list is an opinion —
 * "sorted by nothing", "every column visible" — and survives as one.
 */
function askedFor<T>(entries: T[] | undefined, keep: (entry: T) => boolean): T[] | undefined {
  if (entries === undefined) return undefined;
  const reachable = entries.filter(keep);
  if (entries.length > 0 && reachable.length === 0) return undefined;
  return reachable;
}

/** Hidden columns are a set; put them in one order so either side compares alike. */
function asSet(ids: PlTableColumnIdJson[]): PlTableColumnIdJson[] {
  return [...ids].sort();
}
