import type {
  PlDataTableFilterState,
  PlDataTableStateV2CacheEntry,
  PlDataTableStateV2Normalized,
  PObjectId,
  PTableColumnSpecJson,
  PTableParamsV2,
  PTableRecordFilter,
  PTableSorting,
} from '@platforma-sdk/model';
import {
  parseJson,
  upgradePlDataTableStateV2,
  type PlDataTableGridStateCore,
  type PlDataTableSheetState,
  type PlDataTableStateV2,
} from '@platforma-sdk/model';
import type {
  Ref,
  WritableComputedRef,
} from 'vue';
import {
  computed,
  watch,
} from 'vue';
import type {
  PlDataTableSettingsV2,
} from '../types';
import {
  isJsonEqual,
} from '@milaboratories/helpers';
import { makePredicate } from '../../PlTableFilters/filters_logic';

function makeDefaultState(): Omit<PlDataTableStateV2CacheEntry, 'sourceId'> {
  return {
    gridState: {},
    sheetsState: [],
    filtersState: [],
  };
}

function getHiddenColIds(state: PlDataTableGridStateCore['columnVisibility']): PObjectId[] | null {
  return state?.hiddenColIds
    ?.map(parseJson)
    .filter((c) => c.type === 'column')
    .map((c) => c.id)
    ?? null;
}

function makePartitionFilters(sheetsState: PlDataTableSheetState[]): PTableRecordFilter[] {
  return sheetsState.map((s) => ({
    type: 'bySingleColumnV2',
    column: {
      type: 'axis',
      id: s.axisId,
    },
    predicate: {
      operator: 'Equal',
      reference: s.value,
    },
  }));
}

function makeFilters(columnsState: PlDataTableFilterState[]): PTableRecordFilter[] {
  return columnsState
    .flatMap((s) => {
      return !s.filter || s.filter.disabled
        ? []
        : [{
            type: 'bySingleColumnV2',
            column: s.id,
            predicate: makePredicate(s.alphabetic, s.filter.value),
          }];
    });
}

function makeSorting(state: PlDataTableGridStateCore['sort']): PTableSorting[] {
  return (
    state?.sortModel.map((item) => {
      const { spec, ...column } = parseJson(
        item.colId as PTableColumnSpecJson,
      );
      const _ = spec;
      return {
        column,
        ascending: item.sort === 'asc',
        naAndAbsentAreLeastValues: item.sort === 'asc',
      };
    }) ?? []
  );
}

function makeDefaultPTableParams(): PTableParamsV2 {
  return {
    hiddenColIds: null,
    partitionFilters: [],
    filters: [],
    sorting: [],
  };
}

function makePTableParams(state: Omit<PlDataTableStateV2CacheEntry, 'sourceId'>): PTableParamsV2 {
  return {
    hiddenColIds: getHiddenColIds(state.gridState.columnVisibility),
    partitionFilters: makePartitionFilters(state.sheetsState),
    filters: makeFilters(state.filtersState),
    sorting: makeSorting(state.gridState.sort),
  };
}

export function useTableState(
  tableStateDenormalized: Ref<PlDataTableStateV2>,
  settings: Ref<PlDataTableSettingsV2>,
): {
    gridState: WritableComputedRef<PlDataTableGridStateCore>;
    sheetsState: WritableComputedRef<PlDataTableSheetState[]>;
    filtersState: WritableComputedRef<PlDataTableFilterState[]>;
  } {
  const tableStateNormalized = computed<PlDataTableStateV2Normalized>({
    get: () => upgradePlDataTableStateV2(tableStateDenormalized.value),
    set: (newState) => {
      const oldState = tableStateDenormalized.value;
      if (!isJsonEqual(oldState, newState)) {
        tableStateDenormalized.value = newState;
      }
    },
  });

  const tableState = computed<Omit<PlDataTableStateV2CacheEntry, 'sourceId'>>({
    get: () => {
      const defaultState = makeDefaultState();

      const sourceId = settings.value.sourceId;
      if (!sourceId) return defaultState;

      const cachedState = tableStateNormalized.value.stateCache
        .find((entry) => entry.sourceId === sourceId);
      if (!cachedState) return defaultState;

      return cachedState;
    },
    set: (state) => {
      const oldState = { ...tableStateNormalized.value };
      const newState: PlDataTableStateV2Normalized = {
        ...oldState,
        pTableParams: makeDefaultPTableParams(),
      };

      const sourceId = settings.value.sourceId;
      if (sourceId) {
        newState.pTableParams = makePTableParams(state);

        const cacheEntry = {
          sourceId,
          ...state,
        };
        const stateIdx = newState.stateCache.findIndex((entry) => entry.sourceId === sourceId);
        if (stateIdx !== -1) {
          newState.stateCache[stateIdx] = cacheEntry;
        } else {
          const CacheDepth = 5;
          newState.stateCache.push(cacheEntry);
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
      const newParams = makePTableParams(state);
      const oldParams = tableStateNormalized.value.pTableParams;
      if (!isJsonEqual(newParams, oldParams)) {
        tableStateNormalized.value = {
          ...tableStateNormalized.value,
          pTableParams: newParams,
        };
      }
    },
  );

  const gridState = computed<PlDataTableGridStateCore>({
    get: () => tableState.value.gridState,
    set: (gridState) => {
      tableState.value = {
        ...tableState.value,
        gridState,
      };
    },
  });

  const sheetsState = computed<PlDataTableSheetState[]>({
    get: () => tableState.value.sheetsState,
    set: (sheetsState) => {
      tableState.value = {
        ...tableState.value,
        sheetsState,
      };
    },
  });

  const filtersState = computed<PlDataTableFilterState[]>({
    get: () => tableState.value.filtersState,
    set: (filtersState) => {
      tableState.value = {
        ...tableState.value,
        filtersState,
      };
    },
  });

  return { gridState, sheetsState, filtersState };
}
