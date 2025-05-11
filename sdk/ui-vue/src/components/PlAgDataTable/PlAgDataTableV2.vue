<script lang="ts" setup>
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
  CellRendererSelectorFunc,
} from 'ag-grid-enterprise';
import {
  ModuleRegistry,
  ClientSideRowModelModule,
  ClipboardModule,
  CellSelectionModule,
  ServerSideRowModelModule,
  isColumnSelectionCol,
} from 'ag-grid-enterprise';
import {
  AgGridVue,
} from 'ag-grid-vue3';
import {
  PlDropdownLine,
} from '@milaboratories/uikit';
import type {
  PTableColumnSpecJson,
  PTableRowKey,
  RowSelectionModel,
  PlDataTableGridStateWithoutSheets,
  AxisId,
  PlDataTableState,
  PTableColumnSpec,
  PTableRecordFilter,
  PTableSorting,
  AxesSpec,
} from '@platforma-sdk/model';
import {
  getAxisId,
  getRawPlatformaInstance,
  parsePTableColumnId,
} from '@platforma-sdk/model';
import canonicalize from 'canonicalize';
import * as lodash from 'lodash';
import {
  computed,
  nextTick,
  ref,
  shallowRef,
  toRefs,
  watch,
} from 'vue';
import {
  AgGridTheme,
} from '../../lib';
import PlOverlayLoading from './PlAgOverlayLoading.vue';
import PlOverlayNoRows from './PlAgOverlayNoRows.vue';
import type {
  PlAgCellButtonAxisParams,
} from './sources/common';
import {
  makeRowId,
} from './sources/common';
import {
  updatePFrameGridOptions,
} from './sources/table-source-v2';
import type {
  PlAgDataTableController,
  PlAgDataTableSettings,
  PlAgDataTableRow,
  PlAgDataTableSettingsPTable,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
} from './types';
import {
  PlAgGridColumnManager,
} from '../PlAgGridColumnManager';
import {
  autoSizeRowNumberColumn,
  PlAgDataTableRowNumberColId,
} from './sources/row-number';
import {
  focusRow,
  makeOnceTracker,
  trackFirstDataRendered,
} from './sources/focus-row';
import PlAgCsvExporter from '../PlAgCsvExporter/PlAgCsvExporter.vue';
import {
  Deferred,
  isJsonEqual,
} from '@milaboratories/helpers';
import PlAgRowCount from './PlAgRowCount.vue';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClipboardModule,
  ServerSideRowModelModule,
  CellSelectionModule,
]);

const tableState = defineModel<PlDataTableState>({ default: { gridState: {} } });
const selectedRows = defineModel<RowSelectionModel>('selectedRows');
const props = defineProps<{
  settings?: Readonly<PlAgDataTableSettings>;
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
   * Force use of client-side row model.
   * Required for reliable work of focusRow.
   * Auto-enabled when selectedRows provided.
   */
  clientSideModel?: boolean;

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
  cellRendererSelector?: CellRendererSelectorFunc<PlAgDataTableRow>;
}>();
const { settings } = toRefs(props);
const emit = defineEmits<{
  rowDoubleClicked: [key?: PTableRowKey];
  columnsChanged: [columns: PTableColumnSpec[]];
  cellButtonClicked: [key?: PTableRowKey];
}>();

const axesSpec = ref<AxesSpec>([]);

/** State upgrader */ (() => {
  if (!tableState.value.pTableParams) tableState.value.pTableParams = {};
})();

function makeSorting(state?: SortState): PTableSorting[] {
  return (
    state?.sortModel.map((item) => {
      const { spec, ...column } = parsePTableColumnId(item.colId as PTableColumnSpecJson);
      const _ = spec;
      return {
        column,
        ascending: item.sort === 'asc',
        naAndAbsentAreLeastValues: item.sort === 'asc',
      };
    }) ?? []
  );
}

const gridState = computed<PlDataTableGridStateWithoutSheets>({
  get: () => {
    const state = tableState.value;
    return {
      sourceId: state.gridState.sourceId,
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

    const newState = {
      ...oldState,
      gridState: { ...oldState.gridState, ...gridState },
      pTableParams: { ...oldState.pTableParams, sorting },
    };

    // Note: the table constantly emits an unchanged state, so I added this
    if (!isJsonEqual(oldState, newState)) {
      tableState.value = newState;
    }
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

const hasSheets = (
  settings?: Readonly<PlAgDataTableSettings>,
): settings is PlAgDataTableSettingsPTable => {
  return settings?.sourceType === 'ptable'
    && !!settings.sheets
    && settings.sheets.length > 0;
};

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
      newSheetsState[sheetId] = oldSheetsState[sheetId] ?? sheet.defaultValue ?? sheet.options[0]?.value;
    }
    sheetsState.value = newSheetsState;
  },
  { immediate: true },
);

const gridApi = shallowRef<GridApi>();

const gridApiDef = shallowRef(new Deferred<GridApi>());

const firstDataRenderedTracker = makeOnceTracker<GridApi<PlAgDataTableRow>>();

const gridOptions = shallowRef<GridOptions<PlAgDataTableRow>>({
  animateRows: false,
  suppressColumnMoveAnimation: true,
  cellSelection: selectedRows.value === undefined,
  initialState: gridState.value,
  autoSizeStrategy: { type: 'fitCellContents' },
  rowSelection: selectedRows.value !== undefined
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
  onRowDataUpdated: (event) => {
    const selectedRowsValue = selectedRows.value;
    if (selectedRowsValue) {
      const nodes = selectedRowsValue
        .selectedRowsKeys
        .map((rowKey) => event.api.getRowNode(makeRowId(rowKey)))
        .filter((node) => !!node);
      event.api.setNodesSelected({ nodes, newValue: true });
    }
  },
  onSelectionChanged: (event) => {
    if (selectedRows.value) {
      const selectedRowsKeys = event.api.getSelectedNodes()
        .map((rowNode) => rowNode.data?.key)
        .filter((rowKey) => !!rowKey);
      selectedRows.value = {
        axesSpec: axesSpec.value,
        selectedRowsKeys,
      };
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
  rowModelType: 'clientSide',
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

  gridApiDef.value.resolve(gridApi.value);
};

const makePartialState = (state: GridState) => {
  return {
    sourceId: gridState.value.sourceId,
    columnOrder: state.columnOrder,
    sort: state.sort,
    columnVisibility: state.columnVisibility as { hiddenColIds: PTableColumnSpecJson[] } | undefined,
  };
};

const onStateUpdated = (event: StateUpdatedEvent) => {
  gridOptions.value.initialState = gridState.value = makePartialState(event.state);
  event.api.autoSizeColumns(event.api.getAllDisplayedColumns().filter((column) => column.getColId() !== PlAgDataTableRowNumberColId));
};

const onGridPreDestroyed = () => {
  gridOptions.value.initialState = gridState.value = makePartialState(gridApi.value!.getState());
  gridApi.value = undefined;
  gridApiDef.value = new Deferred<GridApi>();
};

defineExpose<PlAgDataTableController>({
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
          .filter((colId) => !isColumnSelectionCol(colId))
          .map((colId) => parsePTableColumnId(colId as PTableColumnSpecJson)) ?? [];
      const axes = columns
        .filter((column) => column.type === 'axis')
        .map((axis) => axis.spec);
      axesSpec.value = axes;
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
    loadingOverlayComponentParams: {
      ...gridOptions.value.loadingOverlayComponentParams,
      notReady: false,
    } satisfies PlAgOverlayLoadingParams,
  });
};

let oldSettings: PlAgDataTableSettings | undefined = undefined;

watch(
  () => [settings.value] as const,
  async (state) => {
    try {
      const [settings] = state;

      const gridApi = await gridApiDef.value.promise;

      if (gridApi.isDestroyed()) {
        console.warn('gridApi is destroyed');
        return;
      }

      if (lodash.isEqual(settings, oldSettings)) {
        return;
      };

      oldSettings = settings;

      const sourceType = settings?.sourceType;

      switch (sourceType) {
        case undefined:
          return gridApi.updateGridOptions({
            loading: true,
            loadingOverlayComponentParams: {
              ...gridOptions.value.loadingOverlayComponentParams,
              notReady: true,
            } satisfies PlAgOverlayLoadingParams,
            columnDefs: [],
            rowData: undefined,
            datasource: undefined,
          });

        case 'ptable': {
          if (!settings?.model) {
            return gridApi.updateGridOptions({
              loading: true,
              loadingOverlayComponentParams: {
                ...gridOptions.value.loadingOverlayComponentParams,
                notReady: false,
              } satisfies PlAgOverlayLoadingParams,
              columnDefs: [],
              rowData: undefined,
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

          const options = await updatePFrameGridOptions(
            getRawPlatformaInstance().pFrameDriver,
            settings.model,
            settings.sheets ?? [],
            !!props.clientSideModel || !!selectedRows.value,
            gridState,
            {
              showCellButtonForAxisId: props.showCellButtonForAxisId,
              cellButtonInvokeRowsOnDoubleClick: props.cellButtonInvokeRowsOnDoubleClick,
              trigger: (key?: PTableRowKey) => emit('cellButtonClicked', key),
            } satisfies PlAgCellButtonAxisParams,
          ).catch((err) => {
            gridApi.updateGridOptions({
              loading: false,
              loadingOverlayComponentParams: {
                ...gridOptions.value.loadingOverlayComponentParams,
                notReady: false,
              } satisfies PlAgOverlayLoadingParams,
            });
            throw err;
          });

          return gridApi.updateGridOptions({
            loading: false,
            loadingOverlayComponentParams: {
              ...gridOptions.value.loadingOverlayComponentParams,
              notReady: false,
            } satisfies PlAgOverlayLoadingParams,
            ...options,
          });
        }

        default:
          throw Error(`unsupported source type: ${sourceType satisfies never}`);
      }
    } catch (error: unknown) {
      // How should we handle possible errors?
      console.trace(error);
    }
  },
  { immediate: true, deep: true },
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
  <div class="ap-ag-data-table-container">
    <PlAgGridColumnManager v-if="gridApi && showColumnsPanel" :api="gridApi" :width="columnsPanelWidth" />
    <PlAgCsvExporter v-if="gridApi && showExportButton" :api="gridApi" />
    <div
      v-if="hasSheets(settings) || $slots['before-sheets'] || $slots['after-sheets']"
      class="ap-ag-data-table-sheets"
    >
      <slot name="before-sheets" />
      <template
        v-if="hasSheets(settings)"
      >
        <PlDropdownLine
          v-for="(sheet, i) in settings.sheets"
          :key="i"
          :model-value="sheetsState[makeSheetId(sheet.axis)]"
          :options="sheet.options"
          :prefix="(sheet.axis.annotations?.['pl7.app/label']?.trim() ?? `Unlabeled axis ${i}`) + ':'"
          @update:model-value="(newValue) => onSheetChanged(makeSheetId(sheet.axis), newValue)"
        />
      </template>
      <slot name="after-sheets" />
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
