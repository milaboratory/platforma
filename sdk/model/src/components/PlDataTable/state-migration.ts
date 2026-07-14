import type {
  AxisId,
  CanonicalizedJson,
  PObjectId,
  PTableColumnId,
  PTableColumnSpec,
  PTableRecordFilter,
  PTableSorting,
} from "@milaboratories/pl-model-common";
import {
  canonicalizeJson,
  getPTableColumnId,
  parseJsonSafely,
} from "@milaboratories/pl-model-common";
import { distillFilterSpec } from "../../filters";
import type { PlDataTableFilterState, PlTableFilter } from "./typesV4";
import type {
  PlDataTableFilters,
  PlDataTableFiltersWithMeta,
  PlDataTableSheetState,
  PlDataTableStateV2CacheEntry,
  PlDataTableStateV2Normalized,
  PTableParamsV2,
} from "./typesV8";
import type {
  PlDataTableFilters as PlDataTableFiltersV7,
  PlDataTableFiltersWithMeta as PlDataTableFiltersWithMetaV7,
  PlDataTableGridStateCore as PlDataTableGridStateCoreV7,
  PlDataTableStateV2CacheEntry as PlDataTableStateV2V7CacheEntry,
  PlDataTableStateV2Normalized as PlDataTableStateV2V7,
  PlTableColumnIdJson,
  PTableParamsV2 as PTableParamsV2V7,
} from "./typesV7";
import type {
  PlDataTableGridStateV6,
  PlDataTableStateV2V6,
  PlDataTableStateV2V6CacheEntry,
  PlDataTableV6ColIdJson,
} from "./typesV6";
import type {
  PlDataTableGridStateV5,
  PlDataTableV5ColIdJson,
  PlDataTableV5ColIdWrapper,
} from "./typesV5";
import { isNil } from "es-toolkit";

/**
 * PlDataTableV2 persisted state
 */
export type PlDataTableStateV2 =
  // Old versions of the state
  | {
      // no version
      gridState: {
        columnOrder?: {
          orderedColIds: CanonicalizedJson<PTableColumnSpec>[];
        };
        sort?: {
          sortModel: {
            colId: CanonicalizedJson<PTableColumnSpec>;
            sort: "asc" | "desc";
          }[];
        };
        columnVisibility?: {
          hiddenColIds: CanonicalizedJson<PTableColumnSpec>[];
        };
        sourceId?: string;
        sheets?: Record<CanonicalizedJson<AxisId>, string | number>;
      };
      pTableParams?: {
        sorting?: PTableSorting[];
        filters?: PTableRecordFilter[];
      };
    }
  | {
      version: 2;
      stateCache: {
        sourceId: string;
        gridState: {
          columnOrder?: {
            orderedColIds: CanonicalizedJson<PTableColumnSpec>[];
          };
          sort?: {
            sortModel: {
              colId: CanonicalizedJson<PTableColumnSpec>;
              sort: "asc" | "desc";
            }[];
          };
          columnVisibility?: {
            hiddenColIds: CanonicalizedJson<PTableColumnSpec>[];
          };
        };
        sheetsState: PlDataTableSheetState[];
      }[];
      pTableParams: {
        hiddenColIds: PObjectId[] | null;
        filters: PTableRecordFilter[];
        sorting: PTableSorting[];
      };
    }
  | {
      version: 3;
      stateCache: {
        sourceId: string;
        gridState: {
          columnOrder?: {
            orderedColIds: CanonicalizedJson<PTableColumnSpec>[];
          };
          sort?: {
            sortModel: {
              colId: CanonicalizedJson<PTableColumnSpec>;
              sort: "asc" | "desc";
            }[];
          };
          columnVisibility?: {
            hiddenColIds: CanonicalizedJson<PTableColumnSpec>[];
          };
        };
        sheetsState: PlDataTableSheetState[];
        filtersState: PlDataTableFilterState[];
      }[];
      pTableParams: PTableParamsV2V7;
    }
  | {
      version: 4;
      stateCache: {
        sourceId: string;
        gridState: PlDataTableGridStateV6;
        sheetsState: PlDataTableSheetState[];
        filtersState: PlDataTableFilterState[];
      }[];
      /** Old format; only fields used in migration are typed */
      pTableParams: {
        sourceId: string | null;
        hiddenColIds: PObjectId[] | null;
        sorting: PTableSorting[];
      };
    }
  // v5 stored colIds as `{source, labeled}` wrappers; only the gridState shape differs.
  | {
      version: 5;
      stateCache: {
        sourceId: string;
        gridState: PlDataTableGridStateV5;
        sheetsState: PlDataTableSheetState[];
        filtersState: null | PlDataTableFiltersWithMetaV7;
        defaultFiltersState: null | PlDataTableFiltersWithMetaV7;
        searchString?: string;
      }[];
      pTableParams: PTableParamsV2V7;
    }
  // v6 stored colIds as canonicalized full `PTableColumnSpec` (including
  // annotations + `pl7.app/trace`). v7 strips down to `PTableColumnId`.
  | PlDataTableStateV2V6
  // v7 still had filter leaves serialised as `CanonicalizedJson<PTableColumnId>`
  // strings and `sorting: []` for the "untouched" case.
  | PlDataTableStateV2V7
  // Normalized state
  | PlDataTableStateV2Normalized;

/** Upgrade PlDataTableStateV2 to the latest version */
export function upgradePlDataTableStateV2(
  state: PlDataTableStateV2 | undefined,
): PlDataTableStateV2Normalized {
  // Block just added, had no state, model started earlier than the UI
  if (!state) {
    return createPlDataTableStateV2();
  }
  // v1 -> v2
  if (!("version" in state)) {
    // Non upgradeable as sourceId calculation algorithm has changed, resetting state to default
    state = createPlDataTableStateV2();
  }
  // v2 -> v3
  if (state.version === 2) {
    state = {
      version: 3,
      stateCache: state.stateCache.map((entry) => ({
        ...entry,
        filtersState: [],
      })),
      pTableParams: createDefaultPTableParamsV7(),
    };
  }
  // v3 -> v4
  if (state.version === 3) {
    // Non upgradeable as column ids calculation algorithm has changed, resetting state to default
    state = createPlDataTableStateV2();
  }
  // v4 -> v6: migrate per-column filters to tree-based format (skips v5).
  // v4 gridState already used bare PTableColumnSpec colIds, so we jump
  // straight to v6 without going through the v5 wrapper format.
  if (state.version === 4) {
    state = migrateV4toV6(state);
  }
  // v5 -> v6: unwrap `{source, labeled}` colIds in gridState.
  if (state.version === 5) {
    state = migrateV5toV6(state);
  }
  // v6 -> v7: shrink colIds from full PTableColumnSpec to PTableColumnId.
  if (state.version === 6) {
    state = migrateV6toV7(state);
  }
  // v7 -> v8: parse CanonicalizedJson<PTableColumnId> filter leaves into object
  // form; translate `sorting: []` into `sorting: null`.
  if (state.version === 7) {
    state = migrateV7toV8(state);
  }
  return state;
}

/** Migrate v5 to v6: unwrap `{source, labeled}` colIds in gridState. */
function migrateV5toV6(state: Extract<PlDataTableStateV2, { version: 5 }>): PlDataTableStateV2V6 {
  // pTableParams reset: v5 stored ColumnDiscoveredId-based hiddenColIds with
  // empty-array fields (e.g. `{column, path: [], columnQualifications: [], ...}`).
  // v6 distills empty fields, so the same logical column serialises differently
  // and lookups would silently miss every previously-hidden discovered column.
  // gridState colIds are derived from PTableColumnSpec and unaffected.
  return {
    version: 6,
    stateCache: state.stateCache.map((entry) => ({
      ...entry,
      gridState: unwrapV5GridState(entry.gridState),
    })),
    pTableParams: createDefaultPTableParamsV7(),
  };
}

/** Convert v5 wrapped colId JSON to bare PTableColumnSpec JSON, taking `.source`.
 * gridState colIds may include the row-number sentinel (a JSON-stringified
 * literal, not a wrapped spec) — those pass through unchanged. */
function unwrapV5ColId(json: string): string {
  const parsed: unknown = parseJsonSafely(json as CanonicalizedJson<unknown>);
  return !isNil(parsed) && typeof parsed === "object" && "source" in parsed
    ? canonicalizeJson((parsed as PlDataTableV5ColIdWrapper).source)
    : json;
}

function unwrapV5GridState(gridState: PlDataTableGridStateV5): PlDataTableGridStateV6 {
  const unwrapAs = (json: PlDataTableV5ColIdJson) => unwrapV5ColId(json) as PlDataTableV6ColIdJson;
  return {
    columnOrder: gridState.columnOrder
      ? { orderedColIds: gridState.columnOrder.orderedColIds.map(unwrapAs) }
      : undefined,
    sort: gridState.sort
      ? {
          sortModel: gridState.sort.sortModel.map((s) => ({
            colId: unwrapAs(s.colId),
            sort: s.sort,
          })),
        }
      : undefined,
    columnVisibility: gridState.columnVisibility
      ? { hiddenColIds: gridState.columnVisibility.hiddenColIds.map(unwrapAs) }
      : undefined,
  };
}

/** Migrate v6 to v7: rewrite each colId from a full PTableColumnSpec to its
 * compact PTableColumnId (drops annotations/spec body, ~16× smaller per column). */
function migrateV6toV7(state: PlDataTableStateV2V6): PlDataTableStateV2V7 {
  return {
    version: 7,
    stateCache: state.stateCache.map(
      (entry): PlDataTableStateV2V7CacheEntry => ({
        ...entry,
        gridState: shrinkV6GridState(entry.gridState),
      }),
    ),
    pTableParams: state.pTableParams,
  };
}

/** Convert a v6 fat colId (canonicalized PTableColumnSpec) to a v7 compact colId
 * (canonicalized PTableColumnId). The row-number sentinel is a string literal,
 * not a spec — pass it through unchanged. */
function shrinkV6ColId(json: PlDataTableV6ColIdJson): PlTableColumnIdJson {
  const parsed: unknown = parseJsonSafely(json);
  if (!isNil(parsed) && typeof parsed === "object" && "type" in parsed && "id" in parsed) {
    return canonicalizeJson(getPTableColumnId(parsed as PTableColumnSpec));
  }
  return json as unknown as PlTableColumnIdJson;
}

function shrinkV6GridState(gridState: PlDataTableGridStateV6): PlDataTableGridStateCoreV7 {
  return {
    columnOrder: gridState.columnOrder
      ? { orderedColIds: gridState.columnOrder.orderedColIds.map(shrinkV6ColId) }
      : undefined,
    sort: gridState.sort
      ? {
          sortModel: gridState.sort.sortModel.map((s) => ({
            colId: shrinkV6ColId(s.colId),
            sort: s.sort,
          })),
        }
      : undefined,
    columnVisibility: gridState.columnVisibility
      ? { hiddenColIds: gridState.columnVisibility.hiddenColIds.map(shrinkV6ColId) }
      : undefined,
  };
}

/** Migrate v4 state to v6: convert per-column filters to tree-based format (skips v5). */
function migrateV4toV6(state: Extract<PlDataTableStateV2, { version: 4 }>): PlDataTableStateV2V6 {
  let idCounter = 0;
  const nextId = () => ++idCounter;

  const migratedCache: PlDataTableStateV2V6CacheEntry[] = state.stateCache.map((entry) => {
    const leaves: PlDataTableFiltersWithMetaV7["filters"] = [];
    for (const f of entry.filtersState) {
      if (f.filter !== null && !f.filter.disabled) {
        leaves.push(migrateTableFilter(canonicalizeJson(f.id), f.filter.value, nextId));
      }
    }
    const filtersState: PlDataTableFiltersWithMetaV7 | null =
      leaves.length > 0 ? { id: nextId(), type: "and", filters: leaves } : null;

    return {
      sourceId: entry.sourceId,
      gridState: entry.gridState,
      sheetsState: entry.sheetsState,
      filtersState,
      defaultFiltersState: null,
    };
  });

  const oldSourceId = state.pTableParams.sourceId;
  const currentCache = oldSourceId
    ? migratedCache.find((e) => e.sourceId === oldSourceId)
    : undefined;

  return {
    version: 6,
    stateCache: migratedCache,
    pTableParams:
      currentCache && oldSourceId
        ? {
            sourceId: oldSourceId,
            hiddenColIds:
              state.pTableParams.hiddenColIds?.map((id) => ({ type: "column" as const, id })) ??
              null,
            filters: distillFilterSpec(currentCache.filtersState),
            defaultFilters: null,
            sorting: state.pTableParams.sorting,
          }
        : createDefaultPTableParamsV7(),
  };
}

/** Migrate a single per-column PlTableFilter to a v7-form tree node (legacy
 *  string column ids). v7 → v8 later converts these to object form. */
function migrateTableFilter(
  column: CanonicalizedJson<PTableColumnId>,
  filter: PlTableFilter,
  nextId: () => number,
): PlDataTableFiltersWithMetaV7["filters"][number] {
  const id = nextId();
  switch (filter.type) {
    case "isNA":
      return { id, type: "isNA", column };
    case "isNotNA":
      return { id, type: "isNotNA", column };
    case "number_equals":
      return { id, type: "equal", column, x: filter.reference };
    case "number_notEquals":
      return { id, type: "notEqual", column, x: filter.reference };
    case "number_greaterThan":
      return { id, type: "greaterThan", column, x: filter.reference };
    case "number_greaterThanOrEqualTo":
      return { id, type: "greaterThanOrEqual", column, x: filter.reference };
    case "number_lessThan":
      return { id, type: "lessThan", column, x: filter.reference };
    case "number_lessThanOrEqualTo":
      return { id, type: "lessThanOrEqual", column, x: filter.reference };
    case "number_between":
      return {
        id,
        type: "and",
        filters: [
          filter.includeLowerBound
            ? { id: nextId(), type: "greaterThanOrEqual" as const, column, x: filter.lowerBound }
            : { id: nextId(), type: "greaterThan" as const, column, x: filter.lowerBound },
          filter.includeUpperBound
            ? { id: nextId(), type: "lessThanOrEqual" as const, column, x: filter.upperBound }
            : { id: nextId(), type: "lessThan" as const, column, x: filter.upperBound },
        ],
      };
    case "string_equals":
      return { id, type: "patternEquals", column, value: filter.reference };
    case "string_notEquals":
      return { id, type: "patternNotEquals", column, value: filter.reference };
    case "string_contains":
      return { id, type: "patternContainSubsequence", column, value: filter.reference };
    case "string_doesNotContain":
      return { id, type: "patternNotContainSubsequence", column, value: filter.reference };
    case "string_matches":
      return { id, type: "patternMatchesRegularExpression", column, value: filter.reference };
    case "string_doesNotMatch":
      return {
        id,
        type: "not",
        filter: {
          id: nextId(),
          type: "patternMatchesRegularExpression",
          column,
          value: filter.reference,
        },
      };
    case "string_containsFuzzyMatch":
      return {
        id,
        type: "patternFuzzyContainSubsequence",
        column,
        value: filter.reference,
        maxEdits: filter.maxEdits,
        substitutionsOnly: filter.substitutionsOnly,
        ...(filter.wildcard !== undefined ? { wildcard: filter.wildcard } : {}),
      };
  }
}

/** Default pTableParams in the v7 shape (sorting: []). Used by intermediate
 *  migration steps that produce v6/v7 state before the v7 → v8 conversion. */
function createDefaultPTableParamsV7(): PTableParamsV2V7 {
  return {
    sourceId: null,
    hiddenColIds: null,
    filters: null,
    defaultFilters: null,
    sorting: [],
  };
}

export function createDefaultPTableParams(): PTableParamsV2 {
  return {
    sourceId: null,
    hiddenColIds: null,
    filters: null,
    defaultFilters: null,
    sorting: null,
  };
}

export function createPlDataTableStateV2(): PlDataTableStateV2Normalized {
  return {
    version: 8,
    stateCache: [],
    pTableParams: createDefaultPTableParams(),
  };
}

// --- v7 -> v8 migration ----------------------------------------------------
// Parses CanonicalizedJson<PTableColumnId> filter leaves into the new object
// form. Malformed leaves are dropped; groups that become empty after pruning
// are dropped; cache entries whose tree fully prunes get filtersState: null.
// Also translates `sorting: []` (legacy "untouched") into `sorting: null`.

function migrateV7toV8(state: PlDataTableStateV2V7): PlDataTableStateV2Normalized {
  const newCache: PlDataTableStateV2CacheEntry[] = state.stateCache.map((entry) => ({
    sourceId: entry.sourceId,
    gridState: entry.gridState,
    sheetsState: entry.sheetsState,
    filtersState: convertFiltersWithMeta(entry.filtersState),
    defaultFiltersState: convertFiltersWithMeta(entry.defaultFiltersState),
    searchString: entry.searchString,
  }));

  const params = state.pTableParams;
  let pTableParams: PTableParamsV2;
  if (params.sourceId === null) {
    pTableParams = createDefaultPTableParams();
  } else {
    pTableParams = {
      sourceId: params.sourceId,
      hiddenColIds: params.hiddenColIds,
      // Empty array in legacy state means "not touched" — translate to null so the
      // model falls back to default sorting; non-empty stays as user's explicit value.
      sorting: params.sorting.length === 0 ? null : params.sorting,
      filters: convertFiltersPlain(params.filters),
      defaultFilters: convertFiltersPlain(params.defaultFilters),
    };
  }

  return { version: 8, stateCache: newCache, pTableParams };
}

function convertFiltersWithMeta(
  node: null | PlDataTableFiltersWithMetaV7,
): null | PlDataTableFiltersWithMeta {
  if (node === null) return null;
  const result = pruneFilterNode(node as unknown);
  if (result === undefined) return null;
  return result as PlDataTableFiltersWithMeta;
}

function convertFiltersPlain(node: null | PlDataTableFiltersV7): null | PlDataTableFilters {
  if (node === null) return null;
  const result = pruneFilterNode(node as unknown);
  if (result === undefined) return null;
  return result as PlDataTableFilters;
}

/** Recursively converts and prunes a legacy v7 filter tree. Preserves meta
 *  fields (id/isExpanded/source/isSuppressed) on non-leaf nodes. Returns
 *  `undefined` when the subtree is empty after pruning. */
function pruneFilterNode(node: unknown): unknown | undefined {
  if (!node || typeof node !== "object") return undefined;
  const n = node as { type?: unknown };
  if (n.type === "and" || n.type === "or") {
    const filters = (n as { filters?: unknown[] }).filters ?? [];
    const kept = filters.map((f) => pruneFilterNode(f)).filter((f): f is object => f !== undefined);
    if (kept.length === 0) return undefined;
    return { ...(n as object), type: n.type, filters: kept };
  }
  if (n.type === "not") {
    const inner = pruneFilterNode((n as { filter?: unknown }).filter);
    if (inner === undefined) return undefined;
    return { ...(n as object), type: "not", filter: inner };
  }
  return convertLegacyLeaf(n);
}

function convertLegacyLeaf(leaf: {
  type?: unknown;
  column?: unknown;
  rhs?: unknown;
}): unknown | undefined {
  if (leaf.type === undefined) return leaf;
  const result: Record<string, unknown> = { ...leaf };
  if ("column" in result) {
    const c = parseLegacyLeafColumn(result.column);
    if (c === undefined) return undefined;
    result.column = c;
  }
  if ("rhs" in result) {
    const c = parseLegacyLeafColumn(result.rhs);
    if (c === undefined) return undefined;
    result.rhs = c;
  }
  return result;
}

function parseLegacyLeafColumn(s: unknown): PTableColumnId | undefined {
  if (typeof s !== "string") return undefined;
  const parsed = parseJsonSafely(s as CanonicalizedJson<PTableColumnId>);
  if (!parsed || typeof parsed !== "object") return undefined;
  if (!("type" in parsed) || !("id" in parsed)) return undefined;
  const t = (parsed as { type: unknown }).type;
  if (t !== "axis" && t !== "column") return undefined;
  return parsed as PTableColumnId;
}
