<script lang="ts" setup>
import {
  isJsonEqual,
} from '@milaboratories/helpers';
import type {
  AxisId,
  PlDataTableGridStateCore,
  PlDataTableStateV2,
  PlSelectionModel,
  PTableColumnSpecJson,
  PTableKey,
} from '@platforma-sdk/model';
import {
  createPlDataTableStateV2,
  getRawPlatformaInstance,
  parseJson,
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
  AgGridVue,
} from 'ag-grid-vue3';
import {
  computed,
  ref,
  shallowRef,
  toRefs,
  watch,
} from 'vue';
import {
  AgGridTheme,
} from '../../aggrid';
import PlAgCsvExporter from '../PlAgCsvExporter/PlAgCsvExporter.vue';
import {
  PlAgGridColumnManager,
} from '../PlAgGridColumnManager';
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
import type {
  PlAgCellButtonAxisParams,
} from './sources/table-source-v2';
import {
  makeRowId,
  calculateGridOptions,
} from './sources/table-source-v2';
import type {
  PlAgDataTableV2Controller,
  PlAgDataTableV2Row,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
  PlDataTableColumnsInfo,
  PlDataTableSettingsV2,
  PlDataTableSheetsSettings,
  PTableKeyJson,
} from './types';
import {
  useTableState,
} from './sources/table-state-v2';

const tableState = defineModel<PlDataTableStateV2>({
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
  columnsChanged: [info: PlDataTableColumnsInfo];
  cellButtonClicked: [key?: PTableKey];
}>();

const { gridState, sheetsState } = useTableState(tableState, settings);

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
        selectAll: 'all',
        groupSelects: 'self',
        checkboxes: false,
        headerCheckbox: false,
        enableClickSelection: false,
      }
    : undefined,
  onSelectionChanged: (event) => {
    if (selection.value) {
      const state = event.api.getServerSideSelectionState();
      const selectedKeys = state?.toggledNodes?.map((nodeId) => parseJson(nodeId as PTableKeyJson)) ?? [];
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
  // cacheBlockSize should be tha same as PlMultiSequenceAlignment limit
  // so that selectAll will add all rows to selection
  cacheBlockSize: 1000,
  maxBlocksInCache: 100,
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
    const setGridOption = (
      key: ManagedGridOptionKey,
      value: GridOptions[ManagedGridOptionKey],
    ) => {
      const options = { ...gridOptions.value };
      options[key] = value;
      gridOptions.value = options;
      api.setGridOption(key, value);
    };
    const updateGridOptions = (options: ManagedGridOptions) => {
      gridOptions.value = {
        ...gridOptions.value,
        ...options,
      };
      api.updateGridOptions(options);
    };
    gridApi.value = new Proxy(api, {
      get(target, prop, receiver) {
        switch (prop) {
          case 'setGridOption':
            return setGridOption;
          case 'updateGridOptions':
            return updateGridOptions;
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

// Restore proper types erased by AgGrid
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

// Reload AgGrid when new state arrives from server
const reloadKey = ref(0);
watch(
  () => [gridApi.value, gridState.value] as const,
  ([gridApi, gridState]) => {
    if (!gridApi || gridApi.isDestroyed()) return;
    const selfState = makePartialState(gridApi.getState());
    if (!isJsonEqual(gridState, {}) && !isJsonEqual(gridState, selfState)) {
      gridOptions.value.initialState = gridState;
      ++reloadKey.value;
    }
  },
);

// Make loadingOverlayComponentParams reactive
let oldOptions: GridOptions | null = null;
watch(
  () => [gridApi.value, gridOptions.value] as const,
  ([gridApi, options]) => {
    // Wait for AgGrid reinitialization, gridApi will eventially become initialized
    if (!gridApi || gridApi.isDestroyed()) return;
    if (options.loading && oldOptions?.loading && !isJsonEqual(
      options.loadingOverlayComponentParams,
      oldOptions?.loadingOverlayComponentParams,
    )) {
      // Hack to reapply loadingOverlayComponentParams
      gridApi.setGridOption('loading', false);
      gridApi.setGridOption('loading', true);
    }
    oldOptions = options;
  },
  { immediate: true },
);

// Make cellRendererSelector reactive
const cellRendererSelector = computed(() => props.cellRendererSelector ?? null);
watch(
  () => [gridApi.value, cellRendererSelector.value] as const,
  ([gridApi, cellRendererSelector]) => {
    if (!gridApi || gridApi.isDestroyed()) return;
    gridApi.setGridOption('defaultColDef', {
      ...gridOptions.value.defaultColDef,
      cellRendererSelector: cellRendererSelector ?? undefined,
    });
  },
);

defineExpose<PlAgDataTableV2Controller>({
  focusRow: (rowKey) => focusRow(makeRowId(rowKey), firstDataRenderedTracker),
});

// Propagate columns for filter component
watch(
  () => gridOptions.value,
  (options, oldOptions) => {
    if (
      options.columnDefs
      && !isJsonEqual(options.columnDefs, oldOptions?.columnDefs)
    ) {
      const sourceId = settings.value.sourceId;
      if (sourceId === null) {
        if (selection.value) {
          selection.value = {
            axesSpec: [],
            selectedKeys: [],
          };
        }
        return emit('columnsChanged', {
          sourceId: null,
          columns: [],
        });
      }
      const isColDef = (def: ColDef | ColGroupDef): def is ColDef =>
        !('children' in def);
      const colDefs = options.columnDefs?.filter(isColDef) ?? [];
      const columns = colDefs
        .map((def) => def.colId)
        .filter((colId) => colId !== undefined)
        .filter((colId) => colId !== PlAgDataTableRowNumberColId)
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
      emit('columnsChanged', {
        sourceId,
        columns,
      });
    }
  },
  { immediate: true },
);

// Update AgGrid when settings change
let oldSettings: PlDataTableSettingsV2 | null = null;
const generation = ref(0);
watch(
  () => [gridApi.value, settings.value] as const,
  ([gridApi, settings]) => {
    // Wait for AgGrid reinitialization, gridApi will eventially become initialized
    if (!gridApi || gridApi.isDestroyed()) return;
    // Verify that this is not a false watch trigger
    if (isJsonEqual(settings, oldSettings)) return;
    ++generation.value;
    try {
      // Hide no rows overlay if it is shown, or else loading overlay will not be shown
      gridApi.hideOverlay();

      // No data source selected -> reset state to default
      if (!settings.sourceId) {
        return gridApi.updateGridOptions({
          loading: true,
          loadingOverlayComponentParams: {
            ...gridOptions.value.loadingOverlayComponentParams,
            notReady: true,
          } satisfies PlAgOverlayLoadingParams,
          columnDefs: undefined,
          serverSideDatasource: undefined,
        });
      }

      // Data source changed -> show full page loader, clear selection
      if (settings.sourceId !== oldSettings?.sourceId) {
        gridApi.updateGridOptions({
          loading: true,
          loadingOverlayComponentParams: {
            ...gridOptions.value.loadingOverlayComponentParams,
            notReady: false,
          } satisfies PlAgOverlayLoadingParams,
        });
        if (selection.value) {
          gridApi.setServerSideSelectionState({
            selectAll: false,
            toggledNodes: [],
          });
        }
      }

      // Model updated -> show skeletons instead of data
      if (!settings.model) {
        const state = gridApi.getServerSideGroupLevelState();
        const rowCount = state.length > 0 ? state[0].rowCount : undefined;
        return gridApi.updateGridOptions({
          serverSideDatasource: {
            getRows: (params) => {
              params.success({ rowData: [], rowCount });
            },
          },
        });
      }

      // Model ready -> calculate new state
      const stateGeneration = generation.value;
      calculateGridOptions(
        generation,
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
        if (gridApi.isDestroyed() || stateGeneration !== generation.value) return;
        return gridApi.updateGridOptions({
          ...options,
        });
      }).catch((error: unknown) => {
        if (gridApi.isDestroyed() || stateGeneration !== generation.value) return;
        console.trace(error);
      }).finally(() => {
        if (gridApi.isDestroyed() || stateGeneration !== generation.value) return;
        gridApi.updateGridOptions({
          loading: false,
        });
      });
    } catch (error: unknown) {
      console.trace(error);
    } finally {
      oldSettings = settings;
    }
  },
);

watch(
  () => ({
    gridApi: gridApi.value,
    loadingText: props.loadingText,
    notReadyText: props.notReadyText,
    noRowsText: props.noRowsText,
  }),
  ({ gridApi, loadingText, notReadyText, noRowsText }) => {
    if (!gridApi || gridApi.isDestroyed()) return;
    gridApi.updateGridOptions({
      loadingOverlayComponentParams: {
        ...gridOptions.value.loadingOverlayComponentParams,
        loadingText,
        notReadyText,
      },
      noRowsOverlayComponentParams: {
        ...gridOptions.value.noRowsOverlayComponentParams,
        text: noRowsText,
      },
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
    <PlAgCsvExporter
      v-if="gridApi && showExportButton"
      :api="gridApi"
    />
    <PlAgDataTableSheets
      v-model="sheetsState"
      :settings="sheetsSettings"
    >
      <template #before>
        <slot name="before-sheets" />
      </template>
      <template #after>
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
