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
  makeDefaultPTableParams,
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
import { cachedComputed } from '../../../composition/cachedComputed';

type PlDataTableStateV2CacheEntryNullable = PlDataTableStateV2CacheEntry | {
  sourceId: null;
  gridState: Record<string, never>;
  sheetsState: [];
  filtersState: [];
};

function makeDefaultState(): PlDataTableStateV2CacheEntryNullable {
  return {
    sourceId: null,
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

function makePTableParams(state: PlDataTableStateV2CacheEntry): PTableParamsV2 {
  return {
    sourceId: state.sourceId,
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
  const tableStateNormalized = cachedComputed<PlDataTableStateV2Normalized>({
    get: () => upgradePlDataTableStateV2(tableStateDenormalized.value),
    set: (newState) => tableStateDenormalized.value = newState,
    deep: true,
  });

  const tableState = computed<PlDataTableStateV2CacheEntryNullable>({
    get: () => {
      const defaultState = makeDefaultState();

      const sourceId = settings.value.sourceId;
      if (!sourceId) return defaultState;

      const cachedState = tableStateNormalized.value.stateCache
        .find((entry) => entry.sourceId === sourceId);
      if (!cachedState) return {
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

        const stateIdx = newState.stateCache.findIndex((entry) => entry.sourceId === state.sourceId);
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

  const filtersState = computed<PlDataTableFilterState[]>({
    get: () => tableState.value.filtersState,
    set: (filtersState) => {
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
