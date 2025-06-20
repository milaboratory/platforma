<script lang="ts" setup>
import { isJsonEqual } from '@milaboratories/helpers';
import type {
  AxisId,
  PlDataTableGridStateCore,
  PlDataTableSheetState,
  PlDataTableStateV2,
  PlDataTableStateV2CacheEntry,
  PlDataTableStateV2Normalized,
  PlSelectionModel,
  PTableColumnSpec,
  PTableColumnSpecJson,
  PTableKey,
} from '@platforma-sdk/model';
import {
  createPlDataTableStateV2,
  getRawPlatformaInstance,
  parseJson,
  upgradePlDataTableStateV2,
} from '@platforma-sdk/model';
import type {
  CellRendererSelectorFunc,
  ColDef,
  ColGroupDef,
  GridApi,
  GridOptions,
  GridState,
  ManagedGridOptionKey,
  ManagedGridOptions,
} from 'ag-grid-enterprise';
import {
  CellSelectionModule,
  ClientSideRowModelModule,
  ClipboardModule,
  isColumnSelectionCol,
  ModuleRegistry,
  ServerSideRowModelModule,
} from 'ag-grid-enterprise';
import { AgGridVue } from 'ag-grid-vue3';
import { computed, nextTick, onWatcherCleanup, ref, shallowRef, toRefs, watch } from 'vue';
import { AgGridTheme } from '../../lib';
import PlAgCsvExporter from '../PlAgCsvExporter/PlAgCsvExporter.vue';
import { PlAgGridColumnManager } from '../PlAgGridColumnManager';
import PlOverlayLoading from './PlAgOverlayLoading.vue';
import PlOverlayNoRows from './PlAgOverlayNoRows.vue';
import PlAgRowCount from './PlAgRowCount.vue';
import PlAgDataTableSheets from './PlAgDataTableSheets.vue';
import {
  focusRow,
  makeOnceTracker,
  trackFirstDataRendered,
} from './sources/focus-row';
import {
  autoSizeRowNumberColumn,
  PlAgDataTableRowNumberColId,
} from './sources/row-number';
import {
  makeRowId,
  makeTableFilter,
  makeTableSorting,
  type PlAgCellButtonAxisParams,
  updatePFrameGridOptions,
} from './sources/table-source-v2';
import type {
  PlAgDataTableV2Controller,
  PlAgDataTableV2Row,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
  PlDataTableSettingsV2,
  PlDataTableSheetsSettings,
} from './types';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClipboardModule,
  ServerSideRowModelModule,
  CellSelectionModule,
]);

const tableStateDenormalized = defineModel<PlDataTableStateV2>({
  default: createPlDataTableStateV2(),
});
const selection = defineModel<PlSelectionModel>('selection');
const props = defineProps<{
  /** Required component settings */
  settings: Readonly<PlDataTableSettingsV2>;

  /**
   * The showColumnsPanel prop controls the display of a button that activates
   * the columns management panel in the table. To make the button functional
   * and visible, you must also include the PlAgDataTableToolsPanel component in your layout.
   * This component serves as the target for teleporting the button.
   */
  showColumnsPanel?: boolean;

  /**
   * Css width of the Column Manager (Panel) modal (default value is `368px`)
   */
  columnsPanelWidth?: string;

  /**
   * The showExportButton prop controls the display of a button that allows
   * to export table data in CSV format. To make the button functional
   * and visible, you must also include the PlAgDataTableToolsPanel component in your layout.
   * This component serves as the target for teleporting the button.
   */
  showExportButton?: boolean;

  /**
   * The AxisId property is used to configure and display the PlAgTextAndButtonCell component
   */
  showCellButtonForAxisId?: AxisId;

  /**
   * If cellButtonInvokeRowsOnDoubleClick = true, clicking a button inside the row
   * triggers the doubleClick event for the entire row.
   *
   * If cellButtonInvokeRowsOnDoubleClick = false, the doubleClick event for the row
   * is not triggered, but will triggered cellButtonClicked event with (key: PTableRowKey) argument.
   */
  cellButtonInvokeRowsOnDoubleClick?: boolean;

  /** @see {@link PlAgOverlayLoadingParams.loadingText} */
  loadingText?: string;

  /** @see {@link PlAgOverlayLoadingParams.notReadyText} */
  notReadyText?: string;

  /** @see {@link PlAgOverlayNoRowsParams.text} */
  noRowsText?: string;

  /**
   * Callback to override the default renderer for a given cell.
   * @see https://www.ag-grid.com/vue-data-grid/component-cell-renderer/#dynamic-component-selection
   */
  cellRendererSelector?: CellRendererSelectorFunc<PlAgDataTableV2Row>;
}>();
const { settings } = toRefs(props);
const emit = defineEmits<{
  rowDoubleClicked: [key?: PTableKey];
  columnsChanged: [columns: PTableColumnSpec[]];
  cellButtonClicked: [key?: PTableKey];
}>();

// Extract begin

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
    const newState = {
      ...oldState,
      pTableParams: {},
    };

    const sourceId = settings.value.sourceId;
    if (sourceId) {
      newState.pTableParams = {
        filters: state.sheetsState.map((sheet) => makeTableFilter(sheet.axisId, sheet.value)),
        sorting: makeTableSorting(state.gridState.sort),
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

// Extract end

const sheetsSettings = computed<PlDataTableSheetsSettings>(() => {
  const settingsCopy = { ...settings.value };
  return settingsCopy.sourceId
    ? {
        sheets: settingsCopy.sheets ?? [],
        cachedState: [...sheetsState.value],
      }
    : {
        sheets: [],
        cachedState: [],
      };
});

const gridApi = shallowRef<GridApi<PlAgDataTableV2Row> | null>(null);
const firstDataRenderedTracker = makeOnceTracker<GridApi<PlAgDataTableV2Row>>();
const gridOptions = shallowRef<GridOptions<PlAgDataTableV2Row>>({
  animateRows: false,
  suppressColumnMoveAnimation: true,
  cellSelection: selection.value === undefined,
  initialState: gridState.value,
  autoSizeStrategy: { type: 'fitCellContents' },
  rowSelection: selection.value !== undefined
    ? {
        mode: 'multiRow',
        checkboxes: false,
        headerCheckbox: false,
        enableClickSelection: false,
      }
    : undefined,
  selectionColumnDef: {
    mainMenuItems: [],
    contextMenuItems: [],
    pinned: 'left',
    lockPinned: true,
    suppressSizeToFit: true,
    suppressAutoSize: true,
    sortable: false,
    resizable: false,
  },
  onSelectionChanged: (event) => {
    if (selection.value) {
      const selectedKeys = event.api.getSelectedNodes()
        .map((rowNode) => rowNode.data?.key)
        .filter((rowKey) => !!rowKey);
      selection.value = { ...selection.value, selectedKeys };
    }
  },
  onRowDoubleClicked: (event) => {
    if (event.data && event.data.key) emit('rowDoubleClicked', event.data.key);
  },
  defaultColDef: {
    suppressHeaderMenuButton: true,
    sortingOrder: ['desc', 'asc', null],
    cellRendererSelector: props.cellRendererSelector,
  },
  maintainColumnOrder: true,
  localeText: {
    loadingError: '...',
  },
  rowModelType: 'serverSide',
  maxBlocksInCache: 1000,
  // cacheBlockSize: 100,
  blockLoadDebounceMillis: 500,
  serverSideSortAllLevels: true,
  suppressServerSideFullWidthLoadingRow: true,
  getRowId: (params) => params.data.id,
  loading: true,
  loadingOverlayComponentParams: {
    notReady: true,
    loadingText: props.loadingText,
    notReadyText: props.notReadyText,
  } satisfies PlAgOverlayLoadingParams,
  loadingOverlayComponent: PlOverlayLoading,
  noRowsOverlayComponent: PlOverlayNoRows,
  noRowsOverlayComponentParams: {
    text: props.noRowsText,
  } satisfies PlAgOverlayNoRowsParams,
  defaultCsvExportParams: {
    allColumns: true,
    suppressQuotes: true,
    fileName: 'table.csv',
  },
  statusBar: {
    statusPanels: [
      { statusPanel: PlAgRowCount, align: 'left' },
    ],
  },
  onGridReady: (event) => {
    const api = event.api;
    trackFirstDataRendered(api, firstDataRenderedTracker);
    autoSizeRowNumberColumn(api);
    gridApi.value = new Proxy(api, {
      get(target, prop, receiver) {
        switch (prop) {
          case 'setGridOption':
            return (
              key: ManagedGridOptionKey,
              value: GridOptions[ManagedGridOptionKey],
            ) => {
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
  },
  onStateUpdated: (event) => {
    gridOptions.value.initialState = gridState.value = makePartialState(
      event.state,
    );
    event.api.autoSizeColumns(
      event.api.getAllDisplayedColumns().filter(
        (column) => column.getColId() !== PlAgDataTableRowNumberColId,
      ),
    );
  },
  onGridPreDestroyed: (event) => {
    gridOptions.value.initialState = gridState.value = makePartialState(
      event.api.getState(),
    );
    gridApi.value = null;
  },
});

function makePartialState(state: GridState): PlDataTableGridStateCore {
  return {
    columnOrder: state.columnOrder as {
      orderedColIds: PTableColumnSpecJson[];
    } | undefined,
    sort: state.sort as {
      sortModel: {
        colId: PTableColumnSpecJson;
        sort: 'asc' | 'desc';
      }[];
    } | undefined,
    columnVisibility: state.columnVisibility as {
      hiddenColIds: PTableColumnSpecJson[];
    } | undefined,
  };
};

defineExpose<PlAgDataTableV2Controller>({
  focusRow: (rowKey) => focusRow(makeRowId(rowKey), firstDataRenderedTracker),
});

const reloadKey = ref(0);
watch(
  () => [gridApi.value, gridState.value] as const,
  ([gridApi, gridState]) => {
    if (!gridApi || gridApi.isDestroyed()) return;

    const selfState = makePartialState(gridApi.getState());
    if (isJsonEqual(gridState, selfState)) return;

    gridOptions.value.initialState = gridState;
    ++reloadKey.value;
  },
);

watch(
  () => gridOptions.value,
  (options, oldOptions) => {
    if (!oldOptions) return;
    if (
      options.columnDefs
      && !isJsonEqual(options.columnDefs, oldOptions.columnDefs)
    ) {
      const isColDef = (def: ColDef | ColGroupDef): def is ColDef =>
        !('children' in def);
      const colDefs = options.columnDefs?.filter(isColDef) ?? [];
      const columns = colDefs
        .map((def) => def.colId)
        .filter((colId) => colId !== undefined)
        .filter((colId) => colId !== PlAgDataTableRowNumberColId)
        .filter((colId) => !isColumnSelectionCol(colId))
        .map((colId) => parseJson(colId as PTableColumnSpecJson))
        ?? [];
      const axesSpec = columns
        .filter((column) => column.type === 'axis')
        .map((axis) => axis.spec);
      if (selection.value) {
        selection.value = {
          ...selection.value,
          axesSpec,
        };
      }
      emit('columnsChanged', columns);
    }
    if (
      !isJsonEqual(
        options.loadingOverlayComponentParams,
        oldOptions.loadingOverlayComponentParams,
      ) && options.loading
    ) {
      gridApi.value?.setGridOption('loading', false);
      nextTick(() => gridApi.value?.setGridOption('loading', true));
    }
  },
  { immediate: true },
);

let oldSettings: PlDataTableSettingsV2 | null = null;
watch(
  () => [settings.value, gridApi.value] as const,
  async ([settings, gridApi]) => {
    try {
      if (!gridApi || gridApi.isDestroyed()) return;

      if (isJsonEqual(settings, oldSettings)) return;
      oldSettings = settings;

      if (!settings.sourceId) {
        return gridApi.updateGridOptions({
          loading: true,
          loadingOverlayComponentParams: {
            ...gridOptions.value.loadingOverlayComponentParams,
            notReady: true,
          } satisfies PlAgOverlayLoadingParams,
          columnDefs: [],
          datasource: undefined,
        });
      }

      gridApi.updateGridOptions({
        loading: true,
        loadingOverlayComponentParams: {
          ...gridOptions.value.loadingOverlayComponentParams,
          notReady: false,
        } satisfies PlAgOverlayLoadingParams,
      });

      let aborted = false;
      onWatcherCleanup(() => aborted = true);
      await updatePFrameGridOptions(
        getRawPlatformaInstance().pFrameDriver,
        settings.model,
        settings.sheets ?? [],
        gridState.value.columnVisibility?.hiddenColIds,
        {
          showCellButtonForAxisId: props.showCellButtonForAxisId,
          cellButtonInvokeRowsOnDoubleClick:
            props.cellButtonInvokeRowsOnDoubleClick,
          trigger: (key?: PTableKey) => emit('cellButtonClicked', key),
        } satisfies PlAgCellButtonAxisParams,
      ).then((options) => {
        if (aborted || gridApi.isDestroyed()) return;
        return gridApi.updateGridOptions({
          ...options,
        });
      }).finally(() => {
        if (aborted || gridApi.isDestroyed()) return;
        gridApi.updateGridOptions({
          loading: false,
        });
      });
    } catch (error: unknown) {
      console.trace(error);
    }
  },
  { immediate: true },
);

watch(
  () => props.cellRendererSelector,
  (cellRendererSelector) => {
    if (!gridApi.value) {
      return;
    }
    gridApi.value.setGridOption('defaultColDef', {
      ...gridOptions.value.defaultColDef,
      cellRendererSelector,
    });
  },
);
</script>

<template>
  <div :class="$style.container">
    <PlAgGridColumnManager
      v-if="gridApi && showColumnsPanel"
      :api="gridApi"
      :width="columnsPanelWidth"
    />
    <PlAgCsvExporter v-if="gridApi && showExportButton" :api="gridApi" />
    <PlAgDataTableSheets
      v-if="sheetsSettings.sheets.length > 0"
      v-model="sheetsState"
      :settings="sheetsSettings"
    >
      <template #before-sheets>
        <slot name="before-sheets" />
      </template>
      <template #after-sheets>
        <slot name="after-sheets" />
      </template>
    </PlAgDataTableSheets>
    <AgGridVue
      :key="reloadKey"
      :theme="AgGridTheme"
      :class="$style.grid"
      :grid-options="gridOptions"
    />
  </div>
</template>

<style lang="css" module>
.container {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.grid {
  flex: 1;
}
</style>
