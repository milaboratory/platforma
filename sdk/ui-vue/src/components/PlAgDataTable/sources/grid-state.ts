import { isJsonEqual } from "@milaboratories/helpers";
import {
  canonicalizeJson,
  parseJson,
  type PlDataTableGridStateCore,
  type PlDataTableStateV2CacheEntry,
  type PlTableColumnIdJson,
  type PTableColumnId,
  type PTableSorting,
} from "@platforma-sdk/model";
import { isNil } from "es-toolkit";

/** The fields of a cache entry that the grid's state report determines. */
export type PlDataTableGridFields = Pick<
  PlDataTableStateV2CacheEntry,
  "gridState" | "sorting" | "hiddenColIds"
>;

/**
 * Read what a grid state report means for the entry of the source the grid
 * shows. The report itself is kept as it came, to restore the grid from; the
 * sorting and hidden columns the table is built with are taken out of it.
 *
 * AG Grid leaves out what carries no information — no `sort` while nothing is
 * sorted, no `columnVisibility` while every column is shown — so a missing part
 * means "cleared" once the user has set it before, and "untouched" otherwise.
 * Untouched sorting keeps the block's default; untouched visibility hides the
 * optional columns, which the grid does hide, so an untouched report names them.
 */
export function readGridReport(
  reported: PlDataTableGridStateCore,
  previous: undefined | Pick<PlDataTableStateV2CacheEntry, "sorting" | "hiddenColIds">,
  defaultHiddenColIds: () => PlTableColumnIdJson[],
): PlDataTableGridFields {
  return {
    gridState: reported,
    sorting: readSorting(),
    hiddenColIds: readHiddenColIds(),
  };

  function readSorting(): null | PTableSorting[] {
    if (!isNil(reported.sort)) return convertAgSortingToPTableSorting(reported.sort);
    return isNil(previous?.sorting) ? null : [];
  }

  function readHiddenColIds(): null | PTableColumnId[] {
    if (!isNil(reported.columnVisibility)) {
      return reported.columnVisibility.hiddenColIds.map((id) => parseJson<PTableColumnId>(id));
    }
    if (!isNil(previous?.hiddenColIds)) return [];
    const defaults = defaultHiddenColIds();
    return defaults.length > 0 ? defaults.map((id) => parseJson<PTableColumnId>(id)) : null;
  }
}

/**
 * The state to restore the grid from: the stored report, with the user's
 * choices that a report leaves out spelled out. AG Grid omits a cleared sorting
 * and an all-shown column set from its reports; without them, a grid still
 * showing an older choice, such as one open in another view, would keep it and
 * report it back.
 */
export function createGridRestoreState(fields: PlDataTableGridFields): PlDataTableGridStateCore {
  const { gridState, sorting, hiddenColIds } = fields;
  return {
    ...gridState,
    ...(isNil(gridState.sort) &&
      !isNil(sorting) && { sort: { sortModel: sorting.map(convertPTableSortingToAgSortItem) } }),
    ...(isNil(gridState.columnVisibility) &&
      !isNil(hiddenColIds) && {
        columnVisibility: {
          hiddenColIds: hiddenColIds.map((id) => canonicalizeJson<PTableColumnId>(id)),
        },
      }),
  };
}

/** AG Grid's sort model as table sorting; the least values are the NA ones when ascending. */
export function convertAgSortingToPTableSorting(
  sort: NonNullable<PlDataTableGridStateCore["sort"]>,
): PTableSorting[] {
  return sort.sortModel.map((item) => ({
    column: parseJson<PTableColumnId>(item.colId),
    ascending: item.sort === "asc",
    naAndAbsentAreLeastValues: item.sort === "asc",
  }));
}

/**
 * Whether the grid already shows everything the stored state asks for that it
 * could possibly show.
 *
 * The answer decides whether to destroy and rebuild the grid around the stored
 * state, so it must only ever ask for things a rebuild can deliver. Two kinds of
 * request cannot be delivered, and asking anyway is how this comparison became an
 * engine for endless rebuilds:
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
  const {
    orderedColIds: desiredOrder,
    hiddenColIds: desiredHidden,
    sortModel: desiredSort,
  } = dropColumnsTheGridDoesNotHave(desired, gridColIds);
  const {
    orderedColIds: actualOrder,
    hiddenColIds: actualHidden,
    sortModel: actualSort,
  } = normalizeReportedState(actual);

  if (desiredHidden !== undefined && !isJsonEqual(desiredHidden, actualHidden)) return false;

  if (desiredSort !== undefined && !isJsonEqual(desiredSort, actualSort)) return false;

  if (desiredOrder !== undefined) {
    // Only the relative order of the columns it names: the grid may hold others,
    // and where it puts them is not being asked about.
    const desiredColumns = new Set(desiredOrder);
    const actualOrderOfThose = actualOrder.filter((id) => desiredColumns.has(id));
    if (!isJsonEqual(desiredOrder, actualOrderOfThose)) return false;
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
    hiddenColIds: sortIds(state.columnVisibility?.hiddenColIds ?? []),
    sortModel: state.sort?.sortModel ?? [],
  };
}

/**
 * Strike out every column the stored state names that the grid does not have, so
 * what is left is what the grid can still be asked about.
 */
function dropColumnsTheGridDoesNotHave(
  state: PlDataTableGridStateCore,
  gridColIds: ReadonlySet<PlTableColumnIdJson>,
) {
  const inGrid = (id: PlTableColumnIdJson) => gridColIds.has(id);
  const hidden = keepColumnsInGrid(state.columnVisibility?.hiddenColIds, inGrid);
  return {
    orderedColIds: keepColumnsInGrid(state.columnOrder?.orderedColIds, inGrid),
    hiddenColIds: hidden && sortIds(hidden),
    sortModel: keepColumnsInGrid(state.sort?.sortModel, (item) => inGrid(item.colId)),
  };
}

/**
 * The entries naming a column the grid has, or `undefined` when there is nothing
 * left to ask about: either the field was never expressed, or every column it
 * named is gone and no rebuild brings those back. An explicitly empty list is an
 * opinion — "sorted by nothing", "every column visible" — and survives as one.
 */
function keepColumnsInGrid<T>(
  entries: T[] | undefined,
  inGrid: (entry: T) => boolean,
): T[] | undefined {
  if (entries === undefined) return undefined;
  const kept = entries.filter(inGrid);
  if (entries.length > 0 && kept.length === 0) return undefined;
  return kept;
}

/** Hidden columns are a set; put them in one order so either side compares alike. */
function sortIds(ids: PlTableColumnIdJson[]): PlTableColumnIdJson[] {
  return [...ids].sort();
}

function convertPTableSortingToAgSortItem(
  sorting: PTableSorting,
): NonNullable<PlDataTableGridStateCore["sort"]>["sortModel"][number] {
  return {
    colId: canonicalizeJson<PTableColumnId>(sorting.column),
    sort: sorting.ascending ? "asc" : "desc",
  };
}
