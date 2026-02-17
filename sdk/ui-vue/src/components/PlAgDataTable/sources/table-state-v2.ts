import {
  createDefaultPTableParams,
  parseJson,
  canonicalizeJson,
  upgradePlDataTableStateV2,
  type FilterSpec,
  type FilterSpecLeaf,
  type PTableColumnId,
  type PlDataTableGridStateCore,
  type PlDataTableSheetState,
  type PlDataTableStateV2,
  type PlDataTableStateV2CacheEntry,
  type PlDataTableStateV2Normalized,
  type PObjectId,
  type PTableParamsV2,
  type PTableSorting,
  type PlDataTableFilters,
  distillFilterSpec,
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

function convertPartitionFiltersToFilterSpec(
  sheetsState: PlDataTableSheetState[],
): FilterSpec<FilterSpecLeaf<string>>[] {
  return sheetsState.map((s) => {
    const column = canonicalizeJson<PTableColumnId>({ type: "axis", id: s.axisId }) as string;
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

function createPTableParams(state: PlDataTableStateV2CacheEntry): PTableParamsV2 {
  const parts: FilterSpec<FilterSpecLeaf<string>>[] = [
    ...convertPartitionFiltersToFilterSpec(state.sheetsState),
    ...(state.filtersState ? [state.filtersState] : []),
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
      if (!cachedState) return { ...defaultState, sourceId };

      return cachedState;
    },
    set: (state) => {
      const newState: PlDataTableStateV2Normalized = {
        ...tableStateNormalized.value,
        pTableParams: createDefaultPTableParams(),
      };

      if (state.sourceId) {
        newState.pTableParams = createPTableParams(state);

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

      if (!isJsonEqual(tableStateNormalized.value, newState)) {
        tableStateNormalized.value = newState;
      }
    },
  });

  watch(
    () => tableState.value,
    (value) => isJsonEqual(tableState.value, value) && (tableState.value = value),
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
  watch(gridState, (value) => isJsonEqual(gridState.value, value) && (gridState.value = value), {
    deep: true,
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
  watch(
    sheetsState,
    (value) => isJsonEqual(sheetsState.value, value) && (sheetsState.value = value),
    { deep: true },
  );

  const filtersState = computed<PlAdvancedFilter>({
    get: () => {
      const raw = tableState.value.filtersState;
      const isCorrect =
        raw &&
        (raw.type === "and" || raw.type === "or") &&
        "filters" in raw &&
        Array.isArray(raw.filters);

      return isCorrect
        ? (raw as PlAdvancedFilter)
        : { id: randomInt(), type: "and" as const, isExpanded: true, filters: [] };
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
  watch(
    filtersState,
    (value) => isJsonEqual(filtersState.value, value) && (filtersState.value = value),
    { deep: true },
  );

  return { gridState, sheetsState, filtersState };
}
