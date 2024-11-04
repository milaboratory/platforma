<script lang="ts" setup>
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import type {
  GridApi,
  GridOptions,
  GridReadyEvent,
  ManagedGridOptionKey,
  ManagedGridOptions,
  SortState,
  StateUpdatedEvent,
} from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { ServerSideRowModelModule } from '@ag-grid-enterprise/server-side-row-model';
import { AgGridVue } from '@ag-grid-community/vue3';
import { ClipboardModule } from '@ag-grid-enterprise/clipboard';
import { RangeSelectionModule } from '@ag-grid-enterprise/range-selection';
import { PlDropdownLine } from '@milaboratories/uikit';
import type { AxisId, PlDataTableState, PTableRecordFilter, PTableSorting } from '@platforma-sdk/model';
import canonicalize from 'canonicalize';
import * as lodash from 'lodash';
import { computed, ref, shallowRef, toRefs, watch } from 'vue';
import { AgGridTheme, useWatchFetch } from '../../lib';
import PlOverlayLoading from './PlAgOverlayLoading.vue';
import PlOverlayNoRows from './PlAgOverlayNoRows.vue';
import { updateXsvGridOptions } from './sources/file-source';
import { enrichJoinWithLabelColumns, makeSheets, parseColId, updatePFrameGridOptions } from './sources/table-source';
import type { PlDataTableSettings, PlDataTableSheet } from './types';

ModuleRegistry.registerModules([ClientSideRowModelModule, ClipboardModule, ServerSideRowModelModule, RangeSelectionModule]);

const tableState = defineModel<PlDataTableState>({ default: { gridState: {} } });
const props = defineProps<{
  settings: Readonly<PlDataTableSettings>;
}>();
const { settings } = toRefs(props);

watch(
  () => settings.value,
  async (settings, oldSettings) => {
    if (settings.sourceType !== 'pframe' || !settings.pFrame || !settings.join) return;

    if (
      oldSettings &&
      oldSettings.sourceType === 'pframe' &&
      lodash.isEqual(settings.pFrame, oldSettings.pFrame) &&
      lodash.isEqual(settings.join, oldSettings.join)
    )
      return;

    const platforma = window.platforma;
    if (!platforma) throw Error('platforma not set');

    const pfDriver = platforma.pFrameDriver;
    if (!pfDriver) throw Error('platforma.pFrameDriver not set');

    const enrichedJoin = await enrichJoinWithLabelColumns(pfDriver, settings.pFrame, settings.join);

    const state = tableState.value;

    if (!state.pTableParams) {
      state.pTableParams = {
        sorting: [],
        filters: [],
      };
    }
    state.pTableParams.join = enrichedJoin;

    tableState.value = state;
  },
);

const sheets = useWatchFetch<PlDataTableSettings['sourceType'], PlDataTableSheet[]>(
  () => settings.value.sourceType,
  async (_) => {
    const sourceType = settings.value.sourceType;
    switch (sourceType) {
      case 'pframe': {
        const platforma = window.platforma;
        if (!platforma) throw Error('platforma not set');

        const pfDriver = platforma.pFrameDriver;
        if (!pfDriver) throw Error('platforma.pFrameDriver not set');

        if (!settings.value.pFrame) return [];
        const pFrame = settings.value.pFrame;

        const join = tableState.value.pTableParams?.join;
        if (!join) return [];

        return await makeSheets(pfDriver, pFrame, settings.value.sheetAxes, join);
      }
      case 'ptable': {
        return settings.value.sheets ?? [];
      }
      case 'xsv': {
        return [];
      }
      default:
        throw Error(`unsupported source type: ${sourceType satisfies never}`);
    }
  },
);

function makeSorting(state?: SortState): PTableSorting[] | undefined {
  if (settings.value.sourceType !== 'ptable' && settings.value.sourceType !== 'pframe') return undefined;
  return (
    state?.sortModel.map(
      (item) =>
        ({
          column: parseColId(item.colId),
          ascending: item.sort === 'asc',
          naAndAbsentAreLeastValues: true,
        }) as PTableSorting,
    ) ?? []
  );
}

const gridState = computed({
  get: () => {
    const state = tableState.value;
    return {
      columnOrder: state.gridState.columnOrder,
      sort: state.gridState.sort,
    };
  },
  set: (gridState) => {
    const state = tableState.value;

    // do not apply driver sorting for client side rendering
    const sorting = gridOptions.value.rowModelType === 'clientSide' ? undefined : makeSorting(gridState.sort);

    state.gridState.columnOrder = gridState.columnOrder;
    state.gridState.sort = gridState.sort;

    if (settings.value.sourceType === 'ptable' || settings.value.sourceType === 'pframe') {
      if (!state.pTableParams) {
        state.pTableParams = {
          sorting: [],
          filters: [],
        };
      }
      state.pTableParams.sorting = sorting;
    }

    tableState.value = state;
  },
});

const makeSheetId = (axis: AxisId) => canonicalize(axis)!;

function makeFilters(sheetsState: Record<string, string | number>): PTableRecordFilter[] | undefined {
  if (settings.value.sourceType !== 'ptable' && settings.value.sourceType !== 'pframe') return undefined;
  return (
    sheets.value?.map((sheet) => ({
      type: 'bySingleColumn',
      column: sheet.column
        ? {
            type: 'column',
            id: sheet.column,
          }
        : {
            type: 'axis',
            id: sheet.axis,
          },
      predicate: {
        operator: 'Equal',
        reference: sheetsState[makeSheetId(sheet.axis)],
      },
    })) ?? []
  );
}

const sheetsState = computed({
  get: () => tableState.value.gridState.sheets ?? {},
  set: (sheetsState) => {
    const filters = makeFilters(sheetsState);

    const state = tableState.value;

    state.gridState.sheets = sheetsState;

    if (settings.value.sourceType === 'ptable' || settings.value.sourceType === 'pframe') {
      if (!state.pTableParams) {
        state.pTableParams = {
          sorting: [],
          filters: [],
        };
      }
      state.pTableParams.filters = filters;
    }

    tableState.value = state;
  },
});

watch(
  () => [settings.value, sheets.value] as const,
  (state, oldState) => {
    const [settings, sheets] = state;
    if (!sheets) {
      return;
    }
    if (oldState) {
      const [oldSettings, oldSheets] = oldState;
      if (
        (settings.sourceType === 'ptable' || settings.sourceType === 'pframe') &&
        settings.sourceType === oldSettings?.sourceType &&
        lodash.isEqual(sheets, oldSheets)
      )
        return;
    }

    if (settings.sourceType !== 'ptable' && settings.sourceType !== 'pframe') {
      sheetsState.value = {};
      return;
    }

    const newSheetsState = sheetsState.value;
    for (const sheet of sheets) {
      const sheetId = makeSheetId(sheet.axis);
      if (!newSheetsState[sheetId]) {
        newSheetsState[sheetId] = sheet.defaultValue ?? sheet.options[0].value;
      }
    }
    sheetsState.value = newSheetsState;
  },
  { immediate: true },
);

const gridApi = shallowRef<GridApi>();
const gridOptions = ref<GridOptions>({
  animateRows: false,
  suppressColumnMoveAnimation: true,
  cellSelection: true,
  initialState: gridState.value,
  autoSizeStrategy: { type: 'fitCellContents' },
  onRowDataUpdated: (event) => {
    event.api.autoSizeAllColumns();
  },
  maintainColumnOrder: true,
  localeText: {
    loadingError: '...',
  },
  rowModelType: 'clientSide',
  maxBlocksInCache: 1000,
  cacheBlockSize: 100,
  blockLoadDebounceMillis: 500,
  serverSideSortAllLevels: true,
  suppressServerSideFullWidthLoadingRow: true,
  getRowId: (params) => params.data.id,
  loading: true,
  loadingOverlayComponentParams: { notReady: true },
  loadingOverlayComponent: PlOverlayLoading,
  noRowsOverlayComponent: PlOverlayNoRows,
});
const onGridReady = (event: GridReadyEvent) => {
  const api = event.api;
  gridApi.value = new Proxy(api, {
    get(target, prop, receiver) {
      switch (prop) {
        case 'setGridOption':
          return (key: ManagedGridOptionKey, value: GridOptions[ManagedGridOptionKey]) => {
            const options = gridOptions.value;
            options[key] = value;
            gridOptions.value = options;
            api.updateGridOptions(options);
          };
        case 'updateGridOptions':
          return (options: ManagedGridOptions) => {
            gridOptions.value = {
              ...gridOptions.value,
              ...options,
            };
            api.updateGridOptions(options);
          };
        default:
          return Reflect.get(target, prop, receiver);
      }
    },
  });
};
const onStateUpdated = (event: StateUpdatedEvent) => {
  gridState.value = {
    columnOrder: event.state.columnOrder,
    sort: event.state.sort,
  };
  gridOptions.value.initialState = gridState.value;
};
const onGridPreDestroyed = () => {
  const state = gridApi.value!.getState();
  gridState.value = {
    columnOrder: state.columnOrder,
    sort: state.sort,
  };
  gridOptions.value.initialState = gridState.value;
  gridApi.value = undefined;
};

const reloadKey = ref(0);
watch(
  () => [gridApi.value, gridState.value] as const,
  (state, oldState) => {
    if (lodash.isEqual(state, oldState)) return;

    const [gridApi, gridState] = state;
    if (!gridApi) return;

    const selfFullState = gridApi.getState();
    const selfState = {
      columnOrder: selfFullState.columnOrder,
      sort: selfFullState.sort,
    };
    if (lodash.isEqual(gridState, selfState)) return;

    gridOptions.value.initialState = gridState;
    ++reloadKey.value;
  },
);
watch(
  () => gridOptions.value,
  (options, oldOptions) => {
    if (!oldOptions) return;
    if (options.rowModelType != oldOptions.rowModelType) ++reloadKey.value;
  },
);

const onSheetChanged = (sheetId: string, newValue: string | number) => {
  const state = sheetsState.value;
  if (state[sheetId] === newValue) return;
  state[sheetId] = newValue;
  sheetsState.value = state;
  gridApi.value?.updateGridOptions({
    loading: true,
    loadingOverlayComponentParams: { notReady: false },
  });
};

watch(
  () => [gridApi.value, settings.value, sheets.value] as const,
  async (state, oldState) => {
    if (lodash.isEqual(state, oldState)) return;

    const [gridApi, settings, sheets] = state;
    if (!gridApi) return;

    const platforma = window.platforma;
    if (!platforma) throw Error('platforma not set');

    const sourceType = settings.sourceType;
    switch (sourceType) {
      case 'pframe':
      case 'ptable': {
        const pfDriver = platforma.pFrameDriver;
        if (!pfDriver) throw Error('platforma.pFrameDriver not set');
        const pTable = settings.pTable;
        if (!pTable || !sheets) {
          return gridApi.updateGridOptions({
            loading: true,
            loadingOverlayComponentParams: { notReady: true },
            columnDefs: [],
          });
        }
        const options = await updatePFrameGridOptions(pfDriver, pTable, sheets);
        return gridApi.updateGridOptions({
          loading: options.rowModelType !== 'clientSide',
          loadingOverlayComponentParams: { notReady: false },
          ...options,
        });
      }

      case 'xsv': {
        const blobDriver = platforma.blobDriver;
        if (!blobDriver) throw Error('platforma.blobDriver not set');

        const xsvFile = settings.xsvFile;
        if (!xsvFile?.ok || !xsvFile.value) {
          return gridApi.updateGridOptions({
            loading: true,
            loadingOverlayComponentParams: { notReady: true },
            columnDefs: [],
          });
        }

        const options = await updateXsvGridOptions(blobDriver, xsvFile.value);
        return gridApi.updateGridOptions({
          loading: true,
          loadingOverlayComponentParams: { notReady: false },
          ...options,
        });
      }

      default:
        throw Error(`unsupported source type: ${sourceType satisfies never}`);
    }
  },
);
</script>

<template>
  <div class="ap-ag-data-table-container">
    <Transition name="ap-ag-data-table-sheets-transition">
      <div v-if="sheets.value && sheets.value.length > 0" class="ap-ag-data-table-sheets">
        <PlDropdownLine
          v-for="(sheet, i) in sheets.value"
          :key="i"
          :model-value="sheetsState[makeSheetId(sheet.axis)]"
          :options="sheet.options"
          @update:model-value="(newValue) => onSheetChanged(makeSheetId(sheet.axis), newValue)"
        />
      </div>
    </Transition>
    <AgGridVue
      :key="reloadKey"
      :theme="AgGridTheme"
      class="ap-ag-data-table-grid"
      :grid-options="gridOptions"
      @grid-ready="onGridReady"
      @state-updated="onStateUpdated"
      @grid-pre-destroyed="onGridPreDestroyed"
    />
  </div>
</template>

<style lang="css" scoped>
.ap-ag-data-table-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.ap-ag-data-table-sheets-transition-enter-active,
.ap-ag-data-table-sheets-transition-leave-active {
  transition: all 0.2s ease-in-out;
}

.ap-ag-data-table-sheets-transition-enter-from,
.ap-ag-data-table-sheets-transition-leave-to {
  margin-top: -52px;
}

.ap-ag-data-table-sheets {
  display: flex;
  flex-direction: row;
  gap: 12px;
  flex-wrap: wrap;
  z-index: 3;
}

.ap-ag-data-table-grid {
  flex: 1;
}
</style>
