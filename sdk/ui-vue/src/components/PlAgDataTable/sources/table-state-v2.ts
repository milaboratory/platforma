import {
  createDefaultPTableParams,
  parseJson,
  canonicalizeJson,
  upgradePlDataTableStateV2,
  type FilterSpec,
  type FilterSpecLeaf,
  type PTableColumnId,
  type PTableColumnSpec,
  type PlDataTableGridStateCore,
  type PlDataTableSheetState,
  type PlDataTableStateV2,
  type PlDataTableStateV2CacheEntry,
  type PlDataTableStateV2Normalized,
  type PTableParamsV2,
  type PTableSorting,
  type PlDataTableFilterSpecLeaf,
  type PlDataTableFilterMeta,
  type PlDataTableFilters,
  distillFilterSpec,
  PlDataTableFiltersWithMeta,
  getPTableColumnId,
  CanonicalizedJson,
} from "@platforma-sdk/model";
import { computed, type Ref, type WritableComputedRef } from "vue";
import type { PlDataTableSettingsV2 } from "../types";
import { isJsonEqual, randomInt, getField, Nil } from "@milaboratories/helpers";
import { computedCached } from "@milaboratories/uikit";
import { isStringValueType, isNumericValueType } from "../../PlAdvancedFilter/utils";
import { debounce, isNil } from "es-toolkit";

export function useTableState(
  tableStateDenormalized: Ref<PlDataTableStateV2>,
  settings: Ref<PlDataTableSettingsV2>,
  columns: Ref<PTableColumnSpec[]>,
  defaultFilters: Ref<Nil | PlDataTableFilters>,
): {
  gridState: WritableComputedRef<PlDataTableGridStateCore>;
  sheetsState: WritableComputedRef<PlDataTableSheetState[]>;

  searchString: WritableComputedRef<string>;
  filtersState: Ref<PlDataTableFiltersWithMeta>;
  defaultFiltersState: Ref<null | PlDataTableFiltersWithMeta>;
  resetDefaultFilters: () => void;
} {
  const tableStateNormalized = computedCached<PlDataTableStateV2Normalized>({
    get: () => upgradePlDataTableStateV2(tableStateDenormalized.value),
    set: debounce((newState) => (tableStateDenormalized.value = newState), 300),
  });

  const tableState = computed<PlDataTableStateV2CacheEntryNullable>({
    get: () => {
      const defaultState = makeDefaultState();

      const sourceId = settings.value.sourceId;
      const undefinedSourceId = "error" in settings.value && settings.value.error == null;
      if (!sourceId && undefinedSourceId) return defaultState;

      const suitableSourceId = sourceId ?? tableStateNormalized.value.stateCache.at(-1)?.sourceId;
      if (!suitableSourceId) return defaultState;

      const cachedState = tableStateNormalized.value.stateCache.find(
        (entry) => entry.sourceId === suitableSourceId,
      );
      if (!cachedState) return { ...defaultState, sourceId: suitableSourceId };

      return cachedState;
    },
    set: (state) => {
      const newState: PlDataTableStateV2Normalized = {
        ...tableStateNormalized.value,
        pTableParams: createDefaultPTableParams(),
      };

      if (state.sourceId) {
        newState.pTableParams = createPTableParams(state, columns.value);

        const stateIdx = newState.stateCache.findIndex(
          (entry) => entry.sourceId === state.sourceId,
        );
        if (stateIdx !== -1) {
          newState.stateCache.splice(stateIdx, 1);
        }
        const CacheDepth = 5;
        newState.stateCache.push(state);
        newState.stateCache = newState.stateCache.slice(-CacheDepth);
      }

      if (!isJsonEqual(tableStateNormalized.value, newState)) {
        tableStateNormalized.value = newState;
      }
    },
  });

  const gridState = computed<PlDataTableGridStateCore>({
    get: () => tableState.value.gridState,
    set: (gridState) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          gridState,
        };
      }
    },
  });

  const sheetsState = computed<PlDataTableSheetState[]>({
    get: () => tableState.value.sheetsState,
    set: (sheetsState) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          sheetsState,
        };
      }
    },
  });

  // --- User filters (editable by user) ---
  const filtersState = computed<PlDataTableFiltersWithMeta>({
    get: () => {
      const raw = tableState.value.filtersState;
      return isNil(raw) ? getEmptyGroupWithMeta() : normalizeFiltersState(raw);
    },
    set: (filtersState: PlDataTableFiltersWithMeta) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          filtersState,
        };
      }
    },
  });

  // --- Default filters (from model, separate list) ---
  const defaultFiltersState = computed<null | PlDataTableFiltersWithMeta>({
    get: () => {
      const raw = tableState.value.defaultFiltersState;
      if (!isNil(raw)) {
        return normalizeFiltersState(raw);
      }
      if (!isNil(defaultFilters.value)) {
        return annotateFiltersWithIds(normalizeFiltersState(defaultFilters.value));
      }
      return null;
    },
    set: (defaultFiltersState: null | PlDataTableFiltersWithMeta) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          defaultFiltersState,
        };
      }
    },
  });

  function resetDefaultFilters(): void {
    defaultFiltersState.value = isNil(defaultFilters.value)
      ? null
      : annotateFiltersWithIds(normalizeFiltersState(defaultFilters.value));
  }

  const searchString = computed<string>({
    get: () => tableState.value.searchString ?? "",
    set: (searchString: string) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          searchString,
        };
      }
    },
  });

  return {
    gridState,
    sheetsState,
    searchString,
    filtersState,
    defaultFiltersState,
    resetDefaultFilters,
  };
}

// --- Types ---

type PlDataTableStateV2CacheEntryNullable =
  | PlDataTableStateV2CacheEntry
  | {
      sourceId: null;
      gridState: Record<string, never>;
      sheetsState: [];
      filtersState: null;
      defaultFiltersState: null;
      searchString?: string;
    };

type FilterNode = FilterSpec<PlDataTableFilterSpecLeaf>;
type AnnotatedFilterSpec = FilterSpec<PlDataTableFilterSpecLeaf, PlDataTableFilterMeta>;

// --- Core ---

function createPTableParams(
  state: PlDataTableStateV2CacheEntry,
  filterableColumns: PTableColumnSpec[],
): PTableParamsV2 {
  // User filters: sheets + user filter state + search
  const searchNode = createSearchFilterNode(filterableColumns, state.searchString);
  const unsuppressedUserFilters = isNil(state.filtersState)
    ? null
    : stripSuppressedFilters(state.filtersState);
  const userParts = [
    ...convertPartitionFiltersToFilterSpec(state.sheetsState),
    ...(isNil(unsuppressedUserFilters) ? [] : [unsuppressedUserFilters]),
    ...(isNil(searchNode) ? [] : [searchNode]),
  ];
  const filters: null | PlDataTableFilters = distillFilterSpec(
    userParts.length === 0
      ? null
      : userParts.length === 1
        ? userParts[0]
        : { type: "and", filters: userParts },
  );
  const unsuppressedDefaultFilters = isNil(state.defaultFiltersState)
    ? null
    : stripSuppressedFilters(state.defaultFiltersState);
  const defaultFilters: null | PlDataTableFilters = isNil(unsuppressedDefaultFilters)
    ? null
    : // If all filters are suppressed, we should pass an empty filter group instead of null to prevent fallback to defaults in the model
      (distillFilterSpec(unsuppressedDefaultFilters) ?? getEmptyGroup());

  return {
    sourceId: state.sourceId,
    hiddenColIds: getHiddenColIds(state.gridState.columnVisibility),
    sorting: convertAgSortingToPTableSorting(state.gridState.sort),
    filters,
    defaultFilters,
  };
}

/**
 * Normalizes raw filter state into a valid root filter structure.
 * Valid structure is Root(Group, Group, ...) — double nesting required:
 * root is and/or group, each child is also and/or group containing leaf filters.
 * - null/undefined/invalid → empty root
 * - Leaf node → Root(Group(leaf))
 * - Group with leaf children → Root(Group(leaves...))
 * - Group with group children → as-is
 */
function normalizeFiltersState(raw: FilterNode) {
  // Leaf node → wrap in double nesting: Root(Group(leaf))
  if (raw.type !== "and" && raw.type !== "or" && raw.type !== "not") {
    if ("type" in raw && !isNil(raw.type)) {
      return {
        id: randomInt(),
        type: "and" as const,
        isExpanded: true,
        filters: [
          {
            id: randomInt(),
            type: "and" as const,
            isExpanded: true,
            filters: [raw as AnnotatedFilterSpec],
          } as AnnotatedFilterSpec,
        ],
      };
    }
    return getEmptyGroupWithMeta();
  }

  // Already a group — ensure children are also groups (double nesting)
  if ((raw.type === "and" || raw.type === "or") && "filters" in raw && Array.isArray(raw.filters)) {
    const allChildrenAreGroups = raw.filters.every(
      (f: FilterNode) => f.type === "and" || f.type === "or" || f.type === "not",
    );
    if (allChildrenAreGroups) {
      return raw as PlDataTableFiltersWithMeta;
    }
    // Children are leaves — wrap them in a single group
    return {
      id: randomInt(),
      type: raw.type as "and" | "or",
      isExpanded: true,
      filters: [
        {
          id: randomInt(),
          type: raw.type as "and" | "or",
          isExpanded: true,
          filters: raw.filters as AnnotatedFilterSpec[],
        } as AnnotatedFilterSpec,
      ],
    };
  }

  return getEmptyGroupWithMeta();
}

function getEmptyGroup(): PlDataTableFilters {
  return {
    type: "and" as const,
    filters: [],
  };
}
function getEmptyGroupWithMeta(): PlDataTableFiltersWithMeta {
  return {
    ...getEmptyGroup(),
    id: randomInt(),
    isExpanded: true,
  } as PlDataTableFiltersWithMeta;
}

/**
 * Recursively removes nodes where isSuppressed === true from a PlDataTableFiltersWithMeta tree.
 */
function stripSuppressedFilters(node: PlDataTableFiltersWithMeta): PlDataTableFiltersWithMeta {
  return {
    ...node,
    filters: node.filters
      .filter((child) => !("isSuppressed" in child && child.isSuppressed === true))
      .map((child) =>
        "filters" in child && (child.type === "and" || child.type === "or")
          ? stripSuppressedFilters(child as PlDataTableFiltersWithMeta)
          : child,
      ),
  };
}

function createSearchFilterNode(
  columns: PTableColumnSpec[],
  search: null | undefined | string,
): null | FilterSpec<FilterSpecLeaf<CanonicalizedJson<PTableColumnId>>> {
  const trimmed = search?.trim();
  if (isNil(trimmed) || trimmed.length === 0) return null;

  const parts: FilterSpec<FilterSpecLeaf<CanonicalizedJson<PTableColumnId>>>[] = [];
  const numericValue = Number(trimmed);
  const isValidNumber = trimmed.length > 0 && !isNaN(numericValue) && isFinite(numericValue);

  for (const col of columns) {
    const column = canonicalizeJson<PTableColumnId>(getPTableColumnId(col));
    const spec = col.spec;

    if (isStringValueType(spec)) {
      parts.push({ type: "patternEquals", column, value: trimmed });
    }

    if (isNumericValueType(spec) && isValidNumber) {
      parts.push({ type: "equal", column, x: numericValue });
    }
  }

  if (parts.length === 0) return null;

  return { type: "or", filters: parts };
}

// --- Helpers ---

/**
 * Recursively ensures every node in a filter tree has an `id` field.
 * Does not set `source` meta — defaults are now a separate list.
 */
function annotateFiltersWithIds(
  filters: PlDataTableFilters | PlDataTableFiltersWithMeta,
): PlDataTableFiltersWithMeta {
  return annotateNodeWithIds(filters) as PlDataTableFiltersWithMeta;
}

function annotateNodeWithIds(
  node: FilterNode | PlDataTableFilters | PlDataTableFiltersWithMeta,
): AnnotatedFilterSpec {
  switch (node.type) {
    case "and":
      return {
        id: getField(node, "id") ?? randomInt(),
        isExpanded: getField(node, "isExpanded") ?? true,
        type: "and" as const,
        filters: node.filters.map((child) => annotateNodeWithIds(child)),
      };
    case "or":
      return {
        id: getField(node, "id") ?? randomInt(),
        isExpanded: getField(node, "isExpanded") ?? true,
        type: "or" as const,
        filters: node.filters.map((child) => annotateNodeWithIds(child)),
      };
    case "not":
      return {
        id: randomInt(),
        isExpanded: true,
        type: "not" as const,
        filter: annotateNodeWithIds(node.filter),
      };
    default:
      return { ...node, id: getField(node, "id") ?? randomInt() } as AnnotatedFilterSpec;
  }
}

// --- Utilities ---

function convertPartitionFiltersToFilterSpec(
  sheetsState: PlDataTableSheetState[],
): FilterSpec<FilterSpecLeaf<CanonicalizedJson<PTableColumnId>>>[] {
  return sheetsState.map((s) => {
    const column = canonicalizeJson<PTableColumnId>({ type: "axis", id: s.axisId });
    return typeof s.value === "number"
      ? { type: "equal" as const, column, x: s.value }
      : { type: "patternEquals" as const, column, value: s.value };
  });
}

function convertAgSortingToPTableSorting(state: PlDataTableGridStateCore["sort"]): PTableSorting[] {
  return (
    state?.sortModel.map((item) => {
      const { spec: _, ...column } = parseJson(item.colId).labeled;
      return {
        column,
        ascending: item.sort === "asc",
        naAndAbsentAreLeastValues: item.sort === "asc",
      };
    }) ?? []
  );
}

function getHiddenColIds(
  state: PlDataTableGridStateCore["columnVisibility"],
): PTableColumnId[] | null {
  return state?.hiddenColIds?.map((json) => getPTableColumnId(parseJson(json).source)) ?? null;
}

function makeDefaultState(): PlDataTableStateV2CacheEntryNullable {
  return {
    sourceId: null,
    gridState: {},
    sheetsState: [],
    filtersState: null,
    defaultFiltersState: null,
  };
}
