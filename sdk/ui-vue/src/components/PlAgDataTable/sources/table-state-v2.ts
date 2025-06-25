import type {
  AxisId,
  PlDataTableStateV2CacheEntry,
  PlDataTableStateV2Normalized,
  PObjectId,
  PTableColumnSpecJson,
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
} from 'vue';
import type {
  PlDataTableSettingsV2,
} from '../types';
import {
  isJsonEqual,
} from '@milaboratories/helpers';

function makeTableFilter(axisId: AxisId, value: string | number): PTableRecordFilter {
  return {
    type: 'bySingleColumnV2',
    column: {
      type: 'axis',
      id: axisId,
    },
    predicate: {
      operator: 'Equal',
      reference: value,
    },
  };
}

function makeTableSorting(state: PlDataTableGridStateCore['sort']): PTableSorting[] {
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

function getHiddenColIds(state: PlDataTableGridStateCore['columnVisibility']): PObjectId[] | null {
  return state?.hiddenColIds
    ?.map(parseJson)
    .filter((c) => c.type === 'column')
    .map((c) => c.id)
    ?? null;
}

export function useTableState(
  tableStateDenormalized: Ref<PlDataTableStateV2>,
  settings: Ref<PlDataTableSettingsV2>,
): {
    gridState: WritableComputedRef<PlDataTableGridStateCore>;
    sheetsState: WritableComputedRef<PlDataTableSheetState[]>;
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
      const defaultState = {
        gridState: {},
        sheetsState: [],
      };

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
        pTableParams: {
          filters: [],
          sorting: [],
          hiddenColIds: null,
        },
      };

      const sourceId = settings.value.sourceId;
      if (sourceId) {
        newState.pTableParams = {
          filters: state.sheetsState.map((sheet) => makeTableFilter(sheet.axisId, sheet.value)),
          sorting: makeTableSorting(state.gridState.sort),
          hiddenColIds: getHiddenColIds(state.gridState.columnVisibility),
        };

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

  return { gridState, sheetsState };
}
