import type {
  AxisId,
  AxisSpec,
  CanonicalizedJson,
  ColumnUniversalId,
  FilterSpecNode,
  PColumnSpec,
  PTableColumnId,
  PTableSorting,
} from "@milaboratories/pl-model-common";
import {
  canonicalizeJson,
  getAxisId,
  isLabelColumn,
  isLinkerColumn,
  matchAxisId,
  ValueType,
} from "@milaboratories/pl-model-common";
import { isNil } from "es-toolkit";
import { distillFilterSpec } from "../../filters";
import type {
  PlDataTableFilters,
  PlDataTableFiltersWithMeta,
  PlDataTableFilterSpecLeaf,
  PlDataTableSheetState,
  PlDataTableStateV2CacheEntry,
  PlDataTableStateV2Normalized,
} from "./typesV8";

/** What the user set up for the table of the source the UI shows. */
export type PlDataTableUserParams = {
  /** Source the UI shows; `null` until the UI has shown one. */
  sourceId: null | string;
  /** The value picked on each sheet. */
  sheetsState: PlDataTableSheetState[];
  /** The user's own filters without the suppressed ones; `null` when there are none. */
  userFilters: null | PlDataTableFilters;
  /**
   * The user's edit of the default filters: `null` while untouched, so the block's
   * defaults apply, and an empty group once every default is suppressed.
   */
  defaultFilters: null | PlDataTableFilters;
  /** Fast-search text, trimmed; `null` when empty. */
  searchString: null | string;
  /** `null` while untouched, so the block's default sorting applies; `[]` once cleared. */
  sorting: null | PTableSorting[];
  /** Columns the user hid; `null` while untouched, so optional columns stay hidden. */
  hiddenColIds: null | PTableColumnId[];
};

/** A column the fast search looks into. */
export type PlDataTableSearchColumn = {
  id: PTableColumnId;
  valueType: ValueType;
};

/** A column of the table as the fast search sees it. */
export type PlDataTableSearchCandidate = {
  id: ColumnUniversalId;
  spec: PColumnSpec;
  visibility: "default" | "optional" | "hidden";
};

/** Read the user's settings for the source the stored state points at. */
export function readPlDataTableUserParams(
  state: PlDataTableStateV2Normalized,
): PlDataTableUserParams {
  const sourceId = state.pTableParams.sourceId;
  const entry = findEntry(state, sourceId);
  if (isNil(entry)) {
    return {
      sourceId,
      sheetsState: [],
      userFilters: null,
      defaultFilters: null,
      searchString: null,
      sorting: null,
      hiddenColIds: null,
    };
  }

  return {
    sourceId,
    sheetsState: entry.sheetsState,
    userFilters: isNil(entry.filtersState)
      ? null
      : distillFilterSpec(stripSuppressedFilters(entry.filtersState)),
    defaultFilters: isNil(entry.defaultFiltersState)
      ? null
      : (distillFilterSpec(stripSuppressedFilters(entry.defaultFiltersState)) ?? emptyGroup()),
    searchString: entry.searchString?.trim() || null,
    sorting: entry.sorting,
    hiddenColIds: entry.hiddenColIds,
  };
}

/** One filter per sheet, selecting the value picked on it. */
export function createSheetFilters(sheetsState: PlDataTableSheetState[]): PlDataTableFilterNode[] {
  return sheetsState.map((sheet) => {
    const column: PTableColumnId = { type: "axis", id: sheet.axisId };
    return typeof sheet.value === "number"
      ? { type: "equal", column, x: sheet.value }
      : { type: "patternEquals", column, value: sheet.value };
  });
}

/**
 * The columns the fast search looks into: the visible ones, and the visible axes
 * except those a sheet fixes to a single value, where every row would match, and
 * those the table shows through their label column, whose raw values are never
 * on screen. Hidden are columns the block's rules hide, linker columns, and the
 * columns in the user's hidden list, or, while the user has not touched it, the
 * optional ones.
 */
export function collectSearchColumns(params: {
  columns: PlDataTableSearchCandidate[];
  isAxisHidden: (axis: AxisSpec) => boolean;
  sheetAxes: AxisId[];
  hiddenColIds: null | PTableColumnId[];
}): PlDataTableSearchColumn[] {
  const { columns, isAxisHidden, sheetAxes, hiddenColIds } = params;
  const sheetAxisKeys = new Set(sheetAxes.map(axisKey));
  const labeledAxes = columns
    .filter((c) => isLabelColumn(c.spec))
    .flatMap((c) => c.spec.axesSpec.map(getAxisId));
  const shownAxes = uniqueAxes(columns.flatMap((c) => c.spec.axesSpec)).filter((axis) => {
    const id = getAxisId(axis);
    return (
      !sheetAxisKeys.has(axisKey(id)) &&
      !isAxisHidden(axis) &&
      !labeledAxes.some((labeled) => matchAxisId(labeled, id))
    );
  });
  const shownColumns = columns.filter((c) => c.visibility !== "hidden" && !isLinkerColumn(c.spec));

  const hidden = new Set(
    (
      hiddenColIds ??
      shownColumns
        .filter((c) => c.visibility === "optional")
        .map((c): PTableColumnId => ({ type: "column", id: c.id }))
    ).map((id) => canonicalizeJson<PTableColumnId>(id)),
  );

  return [
    ...shownAxes.map((axis): PlDataTableSearchColumn => ({
      id: { type: "axis", id: getAxisId(axis) },
      valueType: axis.type,
    })),
    ...shownColumns.map((c): PlDataTableSearchColumn => ({
      id: { type: "column", id: c.id },
      valueType: c.spec.valueType,
    })),
  ].filter((c) => !hidden.has(canonicalizeJson<PTableColumnId>(c.id)));
}

/**
 * The fast search as a filter: a row matches when any searched column holds the
 * text exactly, or, for a number, holds that number.
 */
export function createSearchFilter(
  searchString: null | string,
  columns: PlDataTableSearchColumn[],
): null | PlDataTableFilters {
  if (isNil(searchString)) return null;
  const number = Number(searchString);
  const isNumber = searchString.length > 0 && Number.isFinite(number);

  const parts = columns.flatMap((c): PlDataTableFilterNode[] => {
    if (c.valueType === ValueType.String) {
      return [{ type: "patternEquals", column: c.id, value: searchString }];
    }
    if (isNumericValueType(c.valueType) && isNumber) {
      return [{ type: "equal", column: c.id, x: number }];
    }
    return [];
  });

  return parts.length === 0 ? null : { type: "or", filters: parts };
}

/** AND of the given filter trees, `null` when none is left. */
export function joinFilters(
  filters: (null | undefined | PlDataTableFilterNode)[],
): null | PlDataTableFilters {
  const operands = filters.flatMap((f): PlDataTableFilterNode[] => {
    if (isNil(f)) return [];
    return f.type === "and" ? f.filters : [f];
  });
  return operands.length === 0 ? null : { type: "and", filters: operands };
}

export type PlDataTableFilterNode = FilterSpecNode<PlDataTableFilterSpecLeaf>;

// Internals

function findEntry(
  state: PlDataTableStateV2Normalized,
  sourceId: null | string,
): undefined | PlDataTableStateV2CacheEntry {
  if (isNil(sourceId)) return undefined;
  return state.stateCache.find((entry) => entry.sourceId === sourceId);
}

function stripSuppressedFilters(node: PlDataTableFiltersWithMeta): PlDataTableFiltersWithMeta {
  return {
    ...node,
    filters: node.filters
      .filter((child) => !("isSuppressed" in child && child.isSuppressed === true))
      .map((child) =>
        (child.type === "and" || child.type === "or") && "filters" in child
          ? stripSuppressedFilters(child)
          : child,
      ),
  };
}

function emptyGroup(): PlDataTableFilters {
  return { type: "and", filters: [] };
}

function isNumericValueType(valueType: ValueType): boolean {
  return (
    valueType === ValueType.Int ||
    valueType === ValueType.Long ||
    valueType === ValueType.Float ||
    valueType === ValueType.Double
  );
}

function axisKey(axisId: AxisId): CanonicalizedJson<AxisId> {
  return canonicalizeJson<AxisId>(axisId);
}

function uniqueAxes(axes: AxisSpec[]): AxisSpec[] {
  const seen = new Set<CanonicalizedJson<AxisId>>();
  return axes.filter((axis) => {
    const key = axisKey(getAxisId(axis));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
