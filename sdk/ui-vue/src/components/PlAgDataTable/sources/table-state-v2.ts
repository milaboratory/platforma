import {
  makeDefaultPTableParams,
  parseJson,
  canonicalizeJson,
  upgradePlDataTableStateV2,
  distillFilter,
  type FilterSpec,
  type FilterSpecLeaf,
  type PTableColumnId,
  type PlDataTableGridStateCore,
  type PlDataTableSheetState,
  type PlDataTableStateV2,
  type PlDataTableStateV2CacheEntry,
  type PlDataTableStateV2Normalized,
  type PObjectId,
  type PTableFilters,
  type PTableParamsV2,
  type PTableSorting,
} from "@platforma-sdk/model";
import { computed, watch, type Ref, type WritableComputedRef } from "vue";
import type { PlDataTableSettingsV2 } from "../types";
import type { PlAdvancedFilter } from "../../PlAdvancedFilter";
import { isJsonEqual, randomInt } from "@milaboratories/helpers";
import { computedCached } from "@milaboratories/uikit";

type PlDataTableStateV2CacheEntryNullable =
  | PlDataTableStateV2CacheEntry
  | {
      sourceId: null;
      gridState: Record<string, never>;
      sheetsState: [];
      filtersState: null;
    };

function makeDefaultState(): PlDataTableStateV2CacheEntryNullable {
  return {
    sourceId: null,
    gridState: {},
    sheetsState: [],
    filtersState: null,
  };
}

function getHiddenColIds(state: PlDataTableGridStateCore["columnVisibility"]): PObjectId[] | null {
  return (
    state?.hiddenColIds?.map(parseJson).reduce((acc, c) => {
      if (c.source.type === "column") {
        acc.push(c.source.id);
      }
      return acc;
    }, [] as PObjectId[]) ?? null
  );
}

function makePartitionFilters(
  sheetsState: PlDataTableSheetState[],
): FilterSpec<FilterSpecLeaf<string>>[] {
  return sheetsState.map((s) => {
    const column = canonicalizeJson<PTableColumnId>({ type: "axis", id: s.axisId }) as string;
    return typeof s.value === "number"
      ? { type: "equal" as const, column, x: s.value }
      : { type: "patternEquals" as const, column, value: s.value };
  });
}

function makeSorting(state: PlDataTableGridStateCore["sort"]): PTableSorting[] {
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

function makePTableParams(state: PlDataTableStateV2CacheEntry): PTableParamsV2 {
  const advancedFilter = distillFilter(state.filtersState);
  const partitionFilters = makePartitionFilters(state.sheetsState);

  const parts: FilterSpec<FilterSpecLeaf<string>>[] = [
    ...partitionFilters,
    ...(advancedFilter ? [advancedFilter] : []),
  ];
  const filters: PTableFilters =
    parts.length === 0 ? null : parts.length === 1 ? parts[0] : { type: "and", filters: parts };

  return {
    sourceId: state.sourceId,
    hiddenColIds: getHiddenColIds(state.gridState.columnVisibility),
    filters,
    sorting: makeSorting(state.gridState.sort),
  };
}

export function useTableState(
  tableStateDenormalized: Ref<PlDataTableStateV2>,
  settings: Ref<PlDataTableSettingsV2>,
): {
  gridState: WritableComputedRef<PlDataTableGridStateCore>;
  sheetsState: WritableComputedRef<PlDataTableSheetState[]>;
  filtersState: WritableComputedRef<PlAdvancedFilter>;
} {
  const tableStateNormalized = computedCached<PlDataTableStateV2Normalized>({
    get: () => upgradePlDataTableStateV2(tableStateDenormalized.value),
    set: (newState) => (tableStateDenormalized.value = newState),
  });

  const tableState = computed<PlDataTableStateV2CacheEntryNullable>({
    get: () => {
      const defaultState = makeDefaultState();

      const sourceId = settings.value.sourceId;
      if (!sourceId) return defaultState;

      const cachedState = tableStateNormalized.value.stateCache.find(
        (entry) => entry.sourceId === sourceId,
      );
      if (!cachedState)
        return {
          ...defaultState,
          sourceId,
        };

      return cachedState;
    },
    set: (state) => {
      const oldState = { ...tableStateNormalized.value };
      const newState: PlDataTableStateV2Normalized = {
        ...oldState,
        pTableParams: makeDefaultPTableParams(),
      };

      if (state.sourceId) {
        newState.pTableParams = makePTableParams(state);

        const stateIdx = newState.stateCache.findIndex(
          (entry) => entry.sourceId === state.sourceId,
        );
        if (stateIdx !== -1) {
          newState.stateCache[stateIdx] = state;
        } else {
          const CacheDepth = 5;
          newState.stateCache.push(state);
          newState.stateCache = newState.stateCache.slice(-CacheDepth);
        }
      }

      tableStateNormalized.value = newState;
    },
  });

  // Update pTableParams when sourceId changes
  watch(
    () => tableState.value,
    (state) => {
      const newParams = state.sourceId ? makePTableParams(state) : makeDefaultPTableParams();
      const oldParams = tableStateNormalized.value.pTableParams;
      if (!isJsonEqual(newParams, oldParams)) {
        tableStateNormalized.value = {
          ...tableStateNormalized.value,
          pTableParams: newParams,
        };
      }
    },
    { deep: true },
  );

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

  const filtersState = computed<PlAdvancedFilter>({
    get: () => {
      const raw = tableState.value.filtersState;
      if (
        raw &&
        (raw.type === "and" || raw.type === "or") &&
        "filters" in raw &&
        Array.isArray(raw.filters)
      ) {
        return raw as PlAdvancedFilter;
      }
      return { id: randomInt(), type: "and" as const, isExpanded: true, filters: [] };
    },
    set: (filtersState: PlAdvancedFilter) => {
      const oldState = tableState.value;
      if (oldState.sourceId) {
        tableState.value = {
          ...oldState,
          filtersState,
        };
      }
    },
  });

  return { gridState, sheetsState, filtersState };
}
