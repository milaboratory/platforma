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
import { computed, ref, watch, type Ref, type WritableComputedRef } from "vue";
import type { PlDataTableSettingsV2 } from "../types";
import { isJsonEqual, Nil, randomInt } from "@milaboratories/helpers";
import { computedCached } from "@milaboratories/uikit";
import { isStringValueType, isNumericValueType } from "../../PlAdvancedFilter/utils";
import { debounce, isNil, uniqBy } from "es-toolkit";

export function useTableState(
  tableStateDenormalized: Ref<PlDataTableStateV2>,
  settings: Ref<PlDataTableSettingsV2>,
  columns: Ref<PTableColumnSpec[]>,
  defaultFilters: Ref<PlDataTableFilters | undefined>,
): {
  gridState: WritableComputedRef<PlDataTableGridStateCore>;
  sheetsState: WritableComputedRef<PlDataTableSheetState[]>;
  filtersState: Ref<PlDataTableFiltersWithMeta>;
  searchString: WritableComputedRef<string>;
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

  const filtersState = computed<PlDataTableFiltersWithMeta>({
    get: () => {
      const raw = tableState.value.filtersState;
      const normalizedRaw = isNil(raw) ? getEmptyGroup() : normalizeFiltersState(raw);
      const normalizedDefault = isNil(defaultFilters.value)
        ? undefined
        : normalizeFiltersState(defaultFilters.value);
      const withDefaults = ensureDefaultFilters(normalizedRaw, normalizedDefault);
      return withDefaults;
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
  const filtersStateDeepReactive = ref(filtersState);
  watch(
    () => filtersStateDeepReactive.value,
    (newValue) => (filtersState.value = newValue),
    { deep: true },
  );

  function resetDefaultFilters(): void {
    if (isNil(defaultFilters.value)) return;

    const current = filtersState.value;
    const normalizedDefaults = normalizeFiltersState(defaultFilters.value);
    const annotatedDefaults = annotateFiltersWithMeta(normalizedDefaults, "default");
    const filters = uniqBy(
      current.filters.flatMap((group) =>
        group.source === "default" ? annotatedDefaults.filters : [group],
      ),
      (group) => (group.source === "default" ? "default" : group.id),
    );

    filtersState.value = {
      ...current,
      filters,
    };
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
    filtersState: filtersStateDeepReactive,
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
      searchString?: string;
    };

type FilterNode = FilterSpec<PlDataTableFilterSpecLeaf>;
type AnnotatedFilterSpec = FilterSpec<PlDataTableFilterSpecLeaf, PlDataTableFilterMeta>;

// --- Core ---

function createPTableParams(
  state: PlDataTableStateV2CacheEntry,
  filterableColumns: PTableColumnSpec[],
): PTableParamsV2 {
  const searchNode = createSearchFilterNode(filterableColumns, state.searchString);
  const unsuppressedFilters = isNil(state.filtersState)
    ? null
    : stripSuppressedFilters(state.filtersState);
  const parts = [
    ...convertPartitionFiltersToFilterSpec(state.sheetsState),
    ...(isNil(unsuppressedFilters) ? [] : [unsuppressedFilters]),
    ...(isNil(searchNode) ? [] : [searchNode]),
  ];
  const filters: null | PlDataTableFilters = distillFilterSpec(
    parts.length === 0 ? null : parts.length === 1 ? parts[0] : { type: "and", filters: parts },
  );

  return {
    sourceId: state.sourceId,
    hiddenColIds: getHiddenColIds(state.gridState.columnVisibility),
    filters,
    sorting: convertAgSortingToPTableSorting(state.gridState.sort),
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
    return getEmptyGroup();
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

  return getEmptyGroup();
}

function getEmptyGroup() {
  return {
    id: randomInt(),
    type: "and" as const,
    isExpanded: true,
    filters: [],
  } as PlDataTableFiltersWithMeta;
}

function ensureDefaultFilters(
  state: PlDataTableFiltersWithMeta,
  defaults: Nil | PlDataTableFiltersWithMeta,
): PlDataTableFiltersWithMeta {
  const hasDefaults = state.filters.some((f) => f.source === "default");

  if (isNil(defaults)) {
    if (hasDefaults) {
      return {
        ...state,
        filters: state.filters.filter((f) => f.source !== "default"),
      };
    }
    return state;
  } else {
    if (hasDefaults) {
      return state;
    }

    const freshDefaults = annotateFiltersWithMeta(defaults, "default");

    return {
      ...state,
      filters: [...freshDefaults.filters, ...state.filters],
    };
  }
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

function annotateFiltersWithMeta(
  filters: PlDataTableFilters | PlDataTableFiltersWithMeta,
  source: "default" | "table-filter" | "table-search",
): PlDataTableFiltersWithMeta {
  return annotateFilterNode(filters as FilterNode, source) as PlDataTableFiltersWithMeta;
}

/**
 * Recursively annotates a PlDataTableFilters tree (no meta) with meta fields,
 * producing a PlDataTableFiltersWithMeta tree.
 */
function annotateFilterNode(
  node: FilterNode,
  source: "default" | "table-filter" | "table-search",
): AnnotatedFilterSpec {
  switch (node.type) {
    case "and":
      return {
        id: randomInt(),
        isExpanded: true,
        source,
        type: "and" as const,
        filters: node.filters.map((child) => annotateFilterNode(child, source)),
      };
    case "or":
      return {
        id: randomInt(),
        isExpanded: true,
        source,
        type: "or" as const,
        filters: node.filters.map((child) => annotateFilterNode(child, source)),
      };
    case "not":
      return {
        id: randomInt(),
        isExpanded: true,
        source,
        type: "not" as const,
        filter: annotateFilterNode(node.filter, source),
      };
    default:
      return { ...node, id: randomInt(), source } as AnnotatedFilterSpec;
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
  };
}
