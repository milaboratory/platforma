<script lang="ts" setup>
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import type {
  ColDef,
  ColGroupDef,
  GridApi,
  GridOptions,
  GridReadyEvent,
  GridState,
  ManagedGridOptionKey,
  ManagedGridOptions,
  SortState,
  StateUpdatedEvent,
} from '@ag-grid-community/core';
import { ModuleRegistry } from '@ag-grid-community/core';
import { AgGridVue } from '@ag-grid-community/vue3';
import { ClipboardModule } from '@ag-grid-enterprise/clipboard';
import { ColumnsToolPanelModule } from '@ag-grid-enterprise/column-tool-panel';
import { RangeSelectionModule } from '@ag-grid-enterprise/range-selection';
import { ServerSideRowModelModule } from '@ag-grid-enterprise/server-side-row-model';
import { SideBarModule } from '@ag-grid-enterprise/side-bar';
import { PlDropdownLine } from '@milaboratories/uikit';
import type { AxisId, PlDataTableSheet, PlDataTableState, PTableColumnSpec, PTableRecordFilter, PTableSorting } from '@platforma-sdk/model';
import canonicalize from 'canonicalize';
import * as lodash from 'lodash';
import { computed, ref, shallowRef, toRefs, watch } from 'vue';
import { AgGridTheme, useWatchFetch } from '../../lib';
import PlOverlayLoading from './PlAgOverlayLoading.vue';
import PlOverlayNoRows from './PlAgOverlayNoRows.vue';
import { updateXsvGridOptions } from './sources/file-source';
import type { PlAgDataTableRow } from './sources/table-source';
import { enrichJoinWithLabelColumns, makeSheets, parseColId, updatePFrameGridOptions } from './sources/table-source';
import type { PlAgDataTableController, PlDataTableSettings } from './types';
import { PlAgGridColumnManager } from '../PlAgGridColumnManager';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClipboardModule,
  ServerSideRowModelModule,
  RangeSelectionModule,
  SideBarModule,
  ColumnsToolPanelModule,
]);

const tableState = defineModel<PlDataTableState>({ default: { gridState: {} } });
const props = defineProps<{
  settings: Readonly<PlDataTableSettings>;
  /**
   * The showColumnsPanel prop controls the display of a button that activates
   * the columns management panel in the table. To make the button functional
   * and visible, you must also include the PlAgDataTableToolsPanel component in your layout.
   * This component serves as the target for teleporting the button.
   */
  showColumnsPanel?: boolean;
}>();
const { settings } = toRefs(props);
const emit = defineEmits<{
  onRowDoubleClicked: [key: unknown[]];
  columnsChanged: [columns: PTableColumnSpec[]];
}>();

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
    state?.sortModel.map((item) => {
      const { spec, ...column } = parseColId(item.colId);
      const _ = spec;
      return {
        column,
        ascending: item.sort === 'asc',
        naAndAbsentAreLeastValues: true,
      } as PTableSorting;
    }) ?? []
  );
}

const gridState = computed({
  get: () => {
    const state = tableState.value;
    return {
      columnOrder: state.gridState.columnOrder,
      sort: state.gridState.sort,
      columnVisibility: state.gridState.columnVisibility,
    };
  },
  set: (gridState) => {
    const state = tableState.value;

    // do not apply driver sorting for client side rendering
    const sorting = gridOptions.value.rowModelType === 'clientSide' ? undefined : makeSorting(gridState.sort);

    state.gridState = { ...state.gridState, ...gridState };

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
      type: 'bySingleColumnV2',
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

const tmpElement = ref<HTMLElement | null>(null);
const textLength = ref(0);

watch(textLength, () => {
  if (tmpElement.value) {
    const newWidth = Math.ceil((tmpElement.value as HTMLElement).getBoundingClientRect().width) + 2;
    document.documentElement.style.setProperty('--cell-width', `${newWidth}px`);
  }
});

function adjustColumnWidth() {
  let api = gridApi.value;
  if (!api) return;

  const value = api.getCellValue({ rowNode: api.getDisplayedRowAtIndex(api.getLastDisplayedRowIndex())!, colKey: '"#"' });
  (tmpElement.value as HTMLElement).innerHTML = '5'.repeat(value.toString().length);
  textLength.value = value.toString().length;
}

const gridApi = shallowRef<GridApi>();
const gridOptions = shallowRef<GridOptions<PlAgDataTableRow>>({
  animateRows: false,
  suppressColumnMoveAnimation: true,
  cellSelection: true,
  initialState: gridState.value,
  autoSizeStrategy: { type: 'fitCellContents' },
  onRowDataUpdated: (event) => {
    event.api.autoSizeAllColumns();
  },
  onRowDoubleClicked: (value) => {
    if (value.data) emit('onRowDoubleClicked', value.data.key);
  },
  onSortChanged: (event) => {
    event.api.refreshCells();
  },
  onFilterChanged: (event) => {
    event.api.refreshCells();
  },
  defaultColDef: {
    suppressHeaderMenuButton: true,
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
  sideBar: {
    // toolPanels: [
    //   {
    //     id: 'columns',
    //     labelDefault: 'Columns',
    //     labelKey: 'columns',
    //     iconKey: 'columns',
    //     toolPanel: 'agColumnsToolPanel',
    //     toolPanelParams: {
    //       suppressRowGroups: true,
    //       suppressValues: true,
    //       suppressPivots: true,
    //       suppressPivotMode: true,
    //       suppressColumnFilter: true,
    //       suppressColumnSelectAll: true,
    //       suppressColumnExpandAll: true,
    //     },
    //   },
    // ],
    // defaultToolPanel: '',
  },
  defaultCsvExportParams: {
    allColumns: true,
    suppressQuotes: true,
    fileName: 'table.csv',
  },
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
            api.setGridOption(key, value);
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
const makePartialState = (state: GridState) => {
  return {
    columnOrder: state.columnOrder,
    sort: state.sort,
    columnVisibility: state.columnVisibility ?? (state.columnOrder ? { hiddenColIds: [] } : undefined),
  };
};
const onStateUpdated = (event: StateUpdatedEvent) => {
  gridOptions.value.initialState = gridState.value = makePartialState(event.state);
  event.api.autoSizeAllColumns();
  adjustColumnWidth();
};
const onGridPreDestroyed = () => {
  gridOptions.value.initialState = gridState.value = makePartialState(gridApi.value!.getState());
  gridApi.value = undefined;
};

let flag = false;
const onStoreRefreshed = () => {
  if (!flag) return;

  const gridApiValue = gridApi.value;
  if (gridApiValue === undefined) return;

  gridApiValue.exportDataAsCsv();

  flag = false;
  gridApiValue.setGridOption('cacheBlockSize', 100);
};
const onModelUpdated = () => {
  if (!flag) return;

  const gridApiValue = gridApi.value;
  if (gridApiValue === undefined) return;

  const state = gridApiValue.getServerSideGroupLevelState()[0];
  if (state.cacheBlockSize! !== state.rowCount) return;

  gridApiValue.refreshServerSide({ route: state.route, purge: false });
};
const exportCsv = async () => {
  const gridApiValue = gridApi.value;
  if (gridApiValue === undefined) return;

  if (gridOptions.value.rowModelType === 'clientSide') {
    gridApiValue.exportDataAsCsv();
    return;
  }

  if (gridOptions.value.rowModelType === 'serverSide') {
    const state = gridApiValue.getServerSideGroupLevelState()[0];

    if (state.rowCount <= state.cacheBlockSize!) {
      gridApiValue.exportDataAsCsv();
      return;
    }

    if (!flag) {
      flag = true;
      gridApiValue.setGridOption('cacheBlockSize', state.rowCount);
    }
  }
};
defineExpose<PlAgDataTableController>({ exportCsv });

const reloadKey = ref(0);
watch(
  () => [gridApi.value, gridState.value] as const,
  (state, oldState) => {
    if (lodash.isEqual(state, oldState)) return;

    const [gridApi, gridState] = state;
    if (!gridApi) return;

    const selfState = makePartialState(gridApi.getState());
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
    if (!lodash.isEqual(options.columnDefs, oldOptions.columnDefs) && options.columnDefs) {
      const idColDef = (def: ColDef | ColGroupDef): def is ColDef => !('children' in def);
      const colDefs: ColDef[] | undefined = options.columnDefs?.filter(idColDef);
      const columns = colDefs
        ?.map((def) => def.colId)
        .filter((colId) => colId !== undefined)
        .filter((colId) => colId !== '"#"')
        .map((colId) => parseColId(colId));
      emit('columnsChanged', columns ?? []);
    }
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

const platforma = window.platforma;
if (!platforma) throw Error('platforma not set');
const pfDriver = platforma.pFrameDriver;
if (!pfDriver) throw Error('platforma.pFrameDriver not set');
const blobDriver = platforma.blobDriver;
if (!blobDriver) throw Error('platforma.blobDriver not set');

let oldSettings: PlDataTableSettings | undefined = undefined;
watch(
  () => [gridApi.value, settings.value, sheets.value] as const,
  async (state) => {
    const [gridApi, settings, sheets] = state;
    if (!gridApi) return;

    if (lodash.isEqual(settings, oldSettings)) return;
    oldSettings = settings;

    const sourceType = settings.sourceType;
    switch (sourceType) {
      case 'pframe':
      case 'ptable': {
        const pTable = settings.pTable;
        if (!pTable || !sheets) {
          return gridApi.updateGridOptions({
            loading: true,
            loadingOverlayComponentParams: { notReady: true },
            columnDefs: [],
          });
        }

        const hiddenColIds = gridState.value?.columnVisibility?.hiddenColIds;
        const options = await updatePFrameGridOptions(pfDriver, pTable, sheets, hiddenColIds);

        return gridApi.updateGridOptions({
          loading: options.rowModelType !== 'clientSide',
          loadingOverlayComponentParams: { notReady: false },
          ...options,
        });
      }

      case 'xsv': {
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
    <div ref="tmpElement" style="visibility: hidden; position: absolute; padding-left: 15px; padding-right: 15px"></div>
    <PlAgGridColumnManager v-if="gridApi && showColumnsPanel" :api="gridApi" />
    <div v-if="sheets.value && sheets.value.length > 0" class="ap-ag-data-table-sheets">
      <PlDropdownLine
        v-for="(sheet, i) in sheets.value"
        :key="i"
        :model-value="sheetsState[makeSheetId(sheet.axis)]"
        :options="sheet.options"
        @update:model-value="(newValue) => onSheetChanged(makeSheetId(sheet.axis), newValue)"
      />
    </div>
    <AgGridVue
      :key="reloadKey"
      :theme="AgGridTheme"
      class="ap-ag-data-table-grid"
      :grid-options="gridOptions"
      @grid-ready="onGridReady"
      @state-updated="onStateUpdated"
      @grid-pre-destroyed="onGridPreDestroyed"
      @store-refreshed="onStoreRefreshed"
      @model-updated="onModelUpdated"
    />
  </div>
</template>

<style>
[col-id='"#"'] {
  max-width: var(--cell-width) !important;
  min-width: var(--cell-width) !important;
  transition: all 0.2s ease-in-out;
}
</style>

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
