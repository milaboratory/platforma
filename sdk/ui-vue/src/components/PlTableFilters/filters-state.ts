import {
  computed,
  type ComputedRef,
  type Ref,
} from 'vue';
import {
  isJsonEqual,
} from '@milaboratories/helpers';
import {
  canonicalizeJson,
  getPTableColumnId,
  upgradePlTableFiltersStateV2,
  type PlTableFiltersStateV2CacheEntry,
  type PlTableFiltersColumnState,
  type PlTableFiltersStateV2,
  type PlTableFiltersStateV2Normalized,
} from '@platforma-sdk/model';
import { makePredicate, isAlphabetic } from './filters_logic';
import type {
  PTableRecordFilter,
  PTableColumnId } from '@platforma-sdk/model';
import type { PlTableFiltersSettingsV2 } from './types';

function makeFilters(columnsState: PlTableFiltersColumnState[]): PTableRecordFilter[] {
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

export function useState(
  stateDenormalized: Ref<PlTableFiltersStateV2>,
  settings: Ref<PlTableFiltersSettingsV2>,
): ComputedRef<PlTableFiltersColumnState[]> {
  const stateNormalized = computed<PlTableFiltersStateV2Normalized>({
    get: () => upgradePlTableFiltersStateV2(stateDenormalized.value),
    set: (newState) => {
      const oldState = stateDenormalized.value;
      if (!isJsonEqual(oldState, newState)) {
        stateDenormalized.value = newState;
      }
    },
  });

  const state = computed<Omit<PlTableFiltersStateV2CacheEntry, 'sourceId'>>({
    get: () => {
      const defaultState = {
        columnsState: [],
      };

      const sourceId = settings.value.sourceId;
      if (!sourceId) return defaultState;

      const cachedState = stateNormalized.value.stateCache
        .find((entry) => entry.sourceId === sourceId);
      if (!cachedState) return defaultState;

      return cachedState;
    },
    set: (state) => {
      const oldState = { ...stateNormalized.value };
      const newState: PlTableFiltersStateV2Normalized = {
        ...oldState,
        pTableFilters: [],
      };

      const sourceId = settings.value.sourceId;
      if (sourceId) {
        newState.pTableFilters = makeFilters(state.columnsState);

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

      stateNormalized.value = newState;
    },
  });

  const columnsState = computed<PlTableFiltersColumnState[]>({
    get: () => {
      const settingsValue = settings.value;
      if (!settingsValue.sourceId) return [];

      const columns = settingsValue.columns;
      if (!columns) return [];

      // Go through the state, delete the nodes not present in columns
      const validColumnIds = new Set(columns.map((c) => getPTableColumnId(c.spec)));
      const filteredState = state.value.columnsState.filter((s) => validColumnIds.has(s.id));

      // Go through the columns, for columns with defaults and no state - add filter to state
      const stateMap = new Map(filteredState.map((s) => [canonicalizeJson<PTableColumnId>(s.id), s]));
      for (const column of columns) {
        const id = getPTableColumnId(column.spec);
        const idKey = canonicalizeJson<PTableColumnId>(id);
        if (!stateMap.get(idKey)) {
          const colState = {
            id,
            alphabetic: isAlphabetic(column.spec),
            options: column.options || [],
            filter: column.default
              ? {
                  value: column.default,
                  disabled: false,
                }
              : null,
          };
          stateMap.set(idKey, colState);
        }
      }

      // States with not null filters should go first, in order they were added, then follow null filters
      return [
        ...stateMap.values().filter((s) => s.filter),
        ...stateMap.values().filter((s) => !s.filter),
      ];
    },
    set: (columnsState) => {
      state.value = {
        ...state.value,
        columnsState,
      };
    },
  });

  return columnsState;
}
