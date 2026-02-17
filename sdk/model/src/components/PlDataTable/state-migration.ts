import type {
  AxisId,
  CanonicalizedJson,
  PObjectId,
  PTableColumnId,
  PTableColumnSpec,
  PTableRecordFilter,
  PTableSorting,
} from "@milaboratories/pl-model-common";
import { canonicalizeJson } from "@milaboratories/pl-model-common";
import { distillFilter } from "../../filters";
import type { PlDataTableFilterState, PlTableFilter } from "./v4";
import type {
  PlDataTableAdvancedFilter,
  PlDataTableGridStateCore,
  PlDataTableSheetState,
  PlDataTableStateV2CacheEntry,
  PlDataTableStateV2Normalized,
  PTableParamsV2,
} from "./v5";

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
      pTableParams: PTableParamsV2;
    }
  | {
      version: 4;
      stateCache: {
        sourceId: string;
        gridState: PlDataTableGridStateCore;
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
      pTableParams: createDefaultPTableParams(),
    };
  }
  // v3 -> v4
  if (state.version === 3) {
    // Non upgradeable as column ids calculation algorithm has changed, resetting state to default
    state = createPlDataTableStateV2();
  }
  // v4 -> v5: migrate per-column filters to tree-based format
  if (state.version === 4) {
    state = migrateV4toV5(state);
  }
  return state;
}

/** Migrate v4 state to v5: convert per-column filters to tree-based format */
function migrateV4toV5(
  state: Extract<PlDataTableStateV2, { version: 4 }>,
): PlDataTableStateV2Normalized {
  let idCounter = 0;
  const nextId = () => ++idCounter;

  const migratedCache: PlDataTableStateV2CacheEntry[] = state.stateCache.map((entry) => {
    const leaves: PlDataTableAdvancedFilter[] = [];
    for (const f of entry.filtersState) {
      if (f.filter !== null && !f.filter.disabled) {
        const column = canonicalizeJson<PTableColumnId>(f.id);
        leaves.push(migrateTableFilter(column, f.filter.value, nextId));
      }
    }
    const filtersState: PlDataTableAdvancedFilter | null =
      leaves.length > 0 ? { id: nextId(), type: "and", filters: leaves } : null;

    return {
      sourceId: entry.sourceId,
      gridState: entry.gridState,
      sheetsState: entry.sheetsState,
      filtersState,
    };
  });

  const oldSourceId = state.pTableParams.sourceId;
  const currentCache = oldSourceId
    ? migratedCache.find((e) => e.sourceId === oldSourceId)
    : undefined;

  return {
    version: 5,
    stateCache: migratedCache,
    pTableParams:
      currentCache && oldSourceId
        ? {
            sourceId: oldSourceId,
            hiddenColIds: state.pTableParams.hiddenColIds,
            filters: distillFilter(currentCache.filtersState),
            sorting: state.pTableParams.sorting,
          }
        : createDefaultPTableParams(),
  };
}

/** Migrate a single per-column PlTableFilter to a tree-based FilterSpec node */
function migrateTableFilter(
  column: string,
  filter: PlTableFilter,
  nextId: () => number,
): PlDataTableAdvancedFilter {
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

export function createDefaultPTableParams(): PTableParamsV2 {
  return {
    sourceId: null,
    hiddenColIds: null,
    filters: null,
    sorting: [],
  };
}

export function createPlDataTableStateV2(): PlDataTableStateV2Normalized {
  return {
    version: 5,
    stateCache: [],
    pTableParams: createDefaultPTableParams(),
  };
}
