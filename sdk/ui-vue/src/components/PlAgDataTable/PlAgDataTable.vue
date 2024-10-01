<script lang="ts" setup>
import './ag-theme.css';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import canonicalize from 'canonicalize';
import type { GridApi, GridOptions, SortState } from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { InfiniteRowModelModule } from '@ag-grid-community/infinite-row-model';
import { AgGridVue } from '@ag-grid-community/vue3';
import { ClipboardModule } from '@ag-grid-enterprise/clipboard';
import { RangeSelectionModule } from '@ag-grid-enterprise/range-selection';
import { PlDropdownLine } from '@milaboratories/uikit';
import type { AxisId, PlDataTableState, PTableRecordFilter, PTableSorting } from '@platforma-sdk/model';
import { computed, ref, watch, shallowRef, toRefs } from 'vue';
import OverlayLoading from './OverlayLoading.vue';
import OverlayNoRows from './OverlayNoRows.vue';
import { updateXsvGridOptions } from './sources/file-source';
import { parseColId, updatePFrameGridOptions } from './sources/table-source';
import type { PlDataTableSettings } from './types';
import * as lodash from 'lodash';

ModuleRegistry.registerModules([ClientSideRowModelModule, ClipboardModule, InfiniteRowModelModule, RangeSelectionModule]);

const tableState = defineModel<PlDataTableState>({ default: { gridState: {} } });
const props = defineProps<{
  settings: Readonly<PlDataTableSettings>;
}>();
const { settings } = toRefs(props);

function makeSorting(state?: SortState): PTableSorting[] | undefined {
  if (settings.value.sourceType !== 'ptable') return undefined;
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
    const sorting = makeSorting(gridState.sort);

    const state = tableState.value;

    state.gridState.columnOrder = gridState.columnOrder;
    state.gridState.sort = gridState.sort;

    if (settings.value.sourceType === 'ptable') {
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
  if (settings.value.sourceType !== 'ptable') return undefined;
  return (
    settings.value.sheets?.map((sheet) => ({
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

    if (settings.value.sourceType === 'ptable') {
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
  () => settings.value,
  (settings, oldSettings) => {
    if (settings.sourceType === 'ptable' && oldSettings?.sourceType === 'ptable' && lodash.isEqual(settings.sheets, oldSettings.sheets)) return;

    if (settings.sourceType !== 'ptable') {
      sheetsState.value = {};
      return;
    }

    const state = sheetsState.value;
    const sheets = settings.sheets ?? [];
    for (const sheet of sheets) {
      const sheetId = makeSheetId(sheet.axis);
      if (!state[sheetId]) {
        state[sheetId] = sheet.defaultValue ?? sheet.options[0].value;
      }
    }
    sheetsState.value = state;
  },
  { immediate: true },
);

const gridApi = shallowRef<GridApi>();
const gridOptions: GridOptions = {
  animateRows: false,
  suppressColumnMoveAnimation: true,
  enableRangeSelection: true,
  initialState: tableState.value.gridState,
  onGridReady: (event) => {
    gridApi.value = event.api;
  },
  onStateUpdated: (event) => {
    gridState.value = {
      columnOrder: event.state.columnOrder,
      sort: event.state.sort,
    };
  },
  autoSizeStrategy: { type: 'fitCellContents' },
  onRowDataUpdated: (event) => {
    event.api.autoSizeAllColumns();
  },
  rowModelType: 'infinite',
  maxBlocksInCache: 10000,
  cacheBlockSize: 100,
  getRowId: (params) => params.data.id,
  loading: true,
  loadingOverlayComponentParams: { notReady: true },
  loadingOverlayComponent: OverlayLoading,
  noRowsOverlayComponent: OverlayNoRows,
};

const reloadKey = ref(0);
watch(
  () => [gridApi.value, gridState.value] as const,
  (state, oldState) => {
    if (lodash.isEqual(state, oldState)) return;

    const [gridApi, gridState] = state;
    if (!gridApi) return;

    const selfState = gridApi.getState();
    if (lodash.isEqual(gridState.columnOrder, selfState.columnOrder) && lodash.isEqual(gridState.sort, selfState.sort)) return;

    gridOptions.initialState = gridState;
    ++reloadKey.value;
  },
);

const onSheetChanged = (sheetId: string, newValue: string | number) => {
  const state = sheetsState.value;
  if (state[sheetId] === newValue) return;
  state[sheetId] = newValue;
  sheetsState.value = state;
};

watch(
  () => [gridApi.value, settings.value] as const,
  async (state, oldState) => {
    if (lodash.isEqual(state, oldState)) return;

    const [gridApi, settings] = state;
    if (!gridApi) return;

    const platforma = window.platforma;
    if (!platforma) throw Error('platforma not set');

    const sourceType = settings.sourceType;
    switch (sourceType) {
      case 'ptable': {
        const pfDriver = platforma.pFrameDriver;
        if (!pfDriver) throw Error('platforma.pFrameDriver not set');

        const pTable = settings.pTable;
        if (!pTable?.ok || !pTable.value) {
          return gridApi.updateGridOptions({
            loading: true,
            loadingOverlayComponentParams: { notReady: true },
            columnDefs: [],
            rowData: [],
          });
        }

        const options = await updatePFrameGridOptions(gridApi, pfDriver, pTable.value, settings.sheets ?? []);
        return gridApi.updateGridOptions({
          loading: true,
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
            rowData: [],
          });
        }

        const options = await updateXsvGridOptions(gridApi, blobDriver, xsvFile.value);
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
    <div v-if="settings.sourceType === 'ptable' && (settings.sheets?.length ?? 0) > 0" class="ap-ag-data-table-sheets">
      <PlDropdownLine
        v-for="(sheet, i) in settings.sheets"
        :key="i"
        :model-value="sheetsState[makeSheetId(sheet.axis)]"
        :options="sheet.options"
        @update:model-value="(newValue) => onSheetChanged(makeSheetId(sheet.axis), newValue)"
      />
    </div>
    <AgGridVue class="ap-ag-data-table-grid" :grid-options="gridOptions" />
  </div>
</template>

<style lang="css" scoped>
.ap-ag-data-table-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
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
