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
import { RangeSelectionModule } from '@ag-grid-enterprise/range-selection';
import { ServerSideRowModelModule } from '@ag-grid-enterprise/server-side-row-model';
import { SideBarModule } from '@ag-grid-enterprise/side-bar';
import { PlDropdownLine } from '@milaboratories/uikit';
import {
  getAxisId,
  getRawPlatformaInstance,
  type AxisId,
  type PlDataTableState,
  type PTableColumnSpec,
  type PTableRecordFilter,
  type PTableSorting,
} from '@platforma-sdk/model';
import canonicalize from 'canonicalize';
import * as lodash from 'lodash';
import { computed, nextTick, ref, shallowRef, toRefs, watch } from 'vue';
import { AgGridTheme } from '../../lib';
import PlOverlayLoading from './PlAgOverlayLoading.vue';
import PlOverlayNoRows from './PlAgOverlayNoRows.vue';
import { updateXsvGridOptions } from './sources/file-source';
import { makeRowId, parseColId, updatePFrameGridOptions } from './sources/table-source';
import type { PlAgDataTableController, PlDataTableSettings, PlAgDataTableRow } from './types';
import { PlAgGridColumnManager } from '../PlAgGridColumnManager';
import { autoSizeRowNumberColumn, PlAgDataTableRowNumberColId } from './sources/row-number';
import { exportCsv } from './sources/export-csv';
import { focusRow, makeOnceTracker, trackFirstDataRendered } from './sources/focus-row';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClipboardModule,
  ServerSideRowModelModule,
  RangeSelectionModule,
  SideBarModule,
]);

const tableState = defineModel<PlDataTableState>({ default: { gridState: {} } });
const props = defineProps<{
  settings?: Readonly<PlDataTableSettings>;
  /**
   * The showColumnsPanel prop controls the display of a button that activates
   * the columns management panel in the table. To make the button functional
   * and visible, you must also include the PlAgDataTableToolsPanel component in your layout.
   * This component serves as the target for teleporting the button.
   */
  showColumnsPanel?: boolean;
  showCellButtonForAxisId?: AxisId;
}>();
const { settings } = toRefs(props);
const emit = defineEmits<{
  onRowDoubleClicked: [key: unknown[]];
  columnsChanged: [columns: PTableColumnSpec[]];
}>();

/** State upgrader */ (() => {
  if (!tableState.value.pTableParams) tableState.value.pTableParams = {};
})();

function makeSorting(state?: SortState): PTableSorting[] {
  return (
    state?.sortModel.map((item) => {
      const { spec, ...column } = parseColId(item.colId);
      const _ = spec;
      return {
        column,
        ascending: item.sort === 'asc',
        naAndAbsentAreLeastValues: true,
      };
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
    // do not apply driver sorting for client side rendering
    const sorting
      = settings.value?.sourceType !== 'ptable' || gridOptions.value.rowModelType === 'clientSide' ? undefined : makeSorting(gridState.sort);

    const oldState = tableState.value;
    tableState.value = {
      ...oldState,
      gridState: { ...oldState.gridState, ...gridState },
      pTableParams: { ...oldState.pTableParams, sorting },
    };
  },
});

const makeSheetId = (axis: AxisId) => canonicalize(getAxisId(axis))!;

function makeFilters(sheetsState: Record<string, string | number>): PTableRecordFilter[] | undefined {
  if (settings.value?.sourceType !== 'ptable') return undefined;
  return (
    settings.value.sheets?.map((sheet) => ({
      type: 'bySingleColumnV2',
      column: {
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

    const oldState = tableState.value;
    tableState.value = {
      ...oldState,
      gridState: { ...oldState.gridState, sheets: sheetsState },
      pTableParams: { ...oldState.pTableParams, filters },
    };
  },
});

watch(
  () => settings.value,
  (settings, oldSettings) => {
    if (settings?.sourceType !== 'ptable' || !settings.sheets) {
      sheetsState.value = {};
      return;
    }

    if (oldSettings && oldSettings.sourceType === 'ptable' && lodash.isEqual(settings.sheets, oldSettings.sheets)) return;

    const oldSheetsState = sheetsState.value;
    const newSheetsState: Record<string, string | number> = {};
    for (const sheet of settings.sheets) {
      const sheetId = makeSheetId(sheet.axis);
      newSheetsState[sheetId] = oldSheetsState[sheetId] ?? sheet.defaultValue ?? sheet.options[0].value;
    }
    sheetsState.value = newSheetsState;
  },
  { immediate: true },
);

const gridApi = shallowRef<GridApi>();
const firstDataRenderedTracker = makeOnceTracker<GridApi>();
const gridOptions = shallowRef<GridOptions<PlAgDataTableRow>>({
  animateRows: false,
  suppressColumnMoveAnimation: true,
  cellSelection: true,
  initialState: gridState.value,
  autoSizeStrategy: { type: 'fitCellContents' },
  // rowSelection: {
  //   mode: 'multiRow',
  //   headerCheckbox: false,
  // },
  onRowDoubleClicked: (event) => {
    if (event.data) emit('onRowDoubleClicked', event.data.key);
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
  // cacheBlockSize: 100,
  blockLoadDebounceMillis: 500,
  serverSideSortAllLevels: true,
  suppressServerSideFullWidthLoadingRow: true,
  getRowId: (params) => params.data.id,
  loading: true,
  loadingOverlayComponentParams: { notReady: true },
  loadingOverlayComponent: PlOverlayLoading,
  noRowsOverlayComponent: PlOverlayNoRows,
  defaultCsvExportParams: {
    allColumns: true,
    suppressQuotes: true,
    fileName: 'table.csv',
  },
});
const onGridReady = (event: GridReadyEvent) => {
  const api = event.api;
  trackFirstDataRendered(api, firstDataRenderedTracker);
  autoSizeRowNumberColumn(api);
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
  event.api.autoSizeColumns(event.api.getAllDisplayedColumns().filter((column) => column.getColId() !== PlAgDataTableRowNumberColId));
};
const onGridPreDestroyed = () => {
  gridOptions.value.initialState = gridState.value = makePartialState(gridApi.value!.getState());
  gridApi.value = undefined;
};

defineExpose<PlAgDataTableController>({
  exportCsv: () => exportCsv(gridApi.value),
  focusRow: (rowKey) => focusRow(makeRowId(rowKey), firstDataRenderedTracker),
});

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
    if (options.columnDefs && !lodash.isEqual(options.columnDefs, oldOptions.columnDefs)) {
      const isColDef = (def: ColDef | ColGroupDef): def is ColDef => !('children' in def);
      const colDefs = options.columnDefs?.filter(isColDef) ?? [];
      const columns
        = colDefs
          .map((def) => def.colId)
          .filter((colId) => colId !== undefined)
          .filter((colId) => colId !== PlAgDataTableRowNumberColId)
          .map((colId) => parseColId(colId)) ?? [];
      emit('columnsChanged', columns);
    }
    if (!lodash.isEqual(options.loadingOverlayComponentParams, oldOptions.loadingOverlayComponentParams) && options.loading) {
      gridApi.value?.setGridOption('loading', false);
      nextTick(() => gridApi.value?.setGridOption('loading', true));
    }
  },
  { immediate: true },
);

const onSheetChanged = (sheetId: string, newValue: string | number) => {
  const state = sheetsState.value;
  if (state[sheetId] === newValue) return;
  state[sheetId] = newValue;
  sheetsState.value = state;
  return gridApi.value?.updateGridOptions({
    loading: true,
    loadingOverlayComponentParams: { notReady: false },
  });
};

let oldSettings: PlDataTableSettings | undefined = undefined;
watch(
  () => [gridApi.value, settings.value] as const,
  async (state) => {
    const [gridApi, settings] = state;
    if (!gridApi) return;

    if (lodash.isEqual(settings, oldSettings)) return;
    oldSettings = settings;

    const sourceType = settings?.sourceType;
    switch (sourceType) {
      case undefined:
        return gridApi.updateGridOptions({
          loading: true,
          loadingOverlayComponentParams: { notReady: true },
          columnDefs: [],
          rowData: undefined,
          datasource: undefined,
        });

      case 'ptable': {
        if (!settings?.pTable) {
          return gridApi.updateGridOptions({
            loading: true,
            loadingOverlayComponentParams: { notReady: false },
            columnDefs: [],
            rowData: undefined,
            datasource: undefined,
          });
        }

        const driver = getRawPlatformaInstance().pFrameDriver;
        const hiddenColIds = gridState.value?.columnVisibility?.hiddenColIds;
        const options = await updatePFrameGridOptions(driver, settings.pTable, settings.sheets ?? [], hiddenColIds, props.showCellButtonForAxisId);

        return gridApi.updateGridOptions({
          loading: false,
          loadingOverlayComponentParams: { notReady: false },
          ...options,
        });
      }

      case 'xsv': {
        const xsvFile = settings?.xsvFile;
        if (!xsvFile) {
          return gridApi.updateGridOptions({
            loading: true,
            loadingOverlayComponentParams: { notReady: false },
            columnDefs: [],
            rowData: undefined,
            datasource: undefined,
          });
        }

        const driver = getRawPlatformaInstance().blobDriver;
        const options = await updateXsvGridOptions(driver, xsvFile);
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
    <PlAgGridColumnManager v-if="gridApi && showColumnsPanel" :api="gridApi" />
    <div v-if="settings?.sourceType === 'ptable' && !!settings.sheets && settings.sheets.length > 0" class="ap-ag-data-table-sheets">
      <PlDropdownLine
        v-for="(sheet, i) in settings.sheets"
        :key="i"
        :model-value="sheetsState[makeSheetId(sheet.axis)]"
        :options="sheet.options"
        :prefix="(sheet.axis.annotations?.['pl7.app/label']?.trim() ?? `Unlabeled axis ${i}`) + ':'"
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
