<script lang="ts" setup>
import { promiseTimeout, isJsonEqual } from '@milaboratories/helpers';
import type {
  AxisId,
  PlDataTableGridStateCore,
  PlDataTableStateV2,
  PlSelectionModel,
  PlTableColumnIdJson,
  PTableColumnSpec,
  PTableKey,
  PTableValue,
} from '@platforma-sdk/model';
import {
  getRawPlatformaInstance,
  parseJson,
  createPlSelectionModel,
  matchAxisId,
  getAxisId,
  canonicalizeJson,
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
import { AgGridVue } from 'ag-grid-vue3';
import { computed, effectScope, ref, shallowRef, toRefs, watch } from 'vue';
import { AgGridTheme } from '../../aggrid';
import PlAgCsvExporter from '../PlAgCsvExporter/PlAgCsvExporter.vue';
import { PlAgGridColumnManager } from '../PlAgGridColumnManager';
import type { PlDataTableFiltersSettings } from '../PlTableFilters';
import PlTableFiltersV2 from '../PlTableFilters/PlTableFiltersV2.vue';
import PlAgDataTableSheets from './PlAgDataTableSheets.vue';
import PlOverlayLoading from './PlAgOverlayLoading.vue';
import PlOverlayNoRows from './PlAgOverlayNoRows.vue';
import PlAgRowCount from './PlAgRowCount.vue';
import { DeferredCircular, ensureNodeVisible } from './sources/focus-row';
import { autoSizeRowNumberColumn, PlAgDataTableRowNumberColId } from './sources/row-number';
import type { PlAgCellButtonAxisParams } from './sources/table-source-v2';
import { calculateGridOptions } from './sources/table-source-v2';
import { useTableState } from './sources/table-state-v2';
import type {
  PlAgDataTableV2Controller,
  PlAgDataTableV2Row,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
  PlDataTableSettingsV2,
  PlDataTableSheetsSettings,
  PlTableRowId,
  PlTableRowIdJson,
} from './types';
import { watchCached } from '@milaboratories/uikit';
import { type PTableHidden } from './sources/common';

const tableState = defineModel<PlDataTableStateV2>({
  required: true,
});
/** Warning: selection model value updates are ignored, use updateSelection instead */
const selection = defineModel<PlSelectionModel>('selection');
const props = defineProps<{
  /** Required component settings */
  settings: Readonly<PlDataTableSettingsV2>;

  /**
   * The disableColumnsPanel prop controls the display of a button that activates
   * the columns management panel in the table. To make the button functional
   * and visible, you must also include the PlAgDataTableToolsPanel component in your layout.
   * This component serves as the target for teleporting the button.
   */
  disableColumnsPanel?: boolean;

  /**
   * The disableFiltersPanel prop controls the display of a button that activates
   * the filters management panel in the table. To make the button functional
   * and visible, you must also include the PlAgDataTableToolsPanel component in your layout.
   * This component serves as the target for teleporting the button.
   */
  disableFiltersPanel?: boolean;

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
  cellButtonClicked: [key?: PTableKey];
  newDataRendered: [];
}>();

const { gridState, sheetsState, filtersState } = useTableState(tableState, settings);

const sheetsSettings = computed<PlDataTableSheetsSettings>(() => {
  const settingsCopy = { ...settings.value };
  return settingsCopy.sourceId !== null
    ? {
        sheets: settingsCopy.sheets ?? [],
        cachedState: [...sheetsState.value],
      }
    : {
        sheets: [],
        cachedState: [],
      };
});

const filterableColumns = ref<PTableColumnSpec[]>([]);
const filtersSettings = computed<PlDataTableFiltersSettings>(() => {
  const settingsCopy = { ...settings.value };
  const columns = filterableColumns.value;
  const result = settingsCopy.sourceId !== null && columns.length > 0
    ? {
        columns,
        config: (column: PTableColumnSpec) => settingsCopy.filtersConfig({ sourceId: settingsCopy.sourceId, column }),
        cachedState: [...filtersState.value],
      }
    : {
        columns: [],
        config: () => ({}),
        cachedState: [],
      };
  return result;
});

const gridApi = shallowRef<GridApi<PlAgDataTableV2Row> | null>(null);
const dataRenderedTracker = new DeferredCircular<GridApi<PlAgDataTableV2Row>>();
const gridOptions = shallowRef<GridOptions<PlAgDataTableV2Row>>({
  animateRows: false,
  suppressColumnMoveAnimation: true,
  cellSelection: !selection.value,
  initialState: gridState.value,
  autoSizeStrategy: { type: 'fitCellContents' },
  rowSelection: selection.value
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
      const selectedKeys = state?.toggledNodes?.map((nodeId) => parseJson(nodeId as PlTableRowIdJson)) ?? [];
      if (!isJsonEqual(selection.value.selectedKeys, selectedKeys)) {
        selection.value = { ...selection.value, selectedKeys };
      }
    }
  },
  onRowDoubleClicked: (event) => {
    if (event.data && event.data.axesKey) emit('rowDoubleClicked', event.data.axesKey);
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
      orderedColIds: PlTableColumnIdJson[];
    } | undefined,
    sort: state.sort as {
      sortModel: {
        colId: PlTableColumnIdJson;
        sort: 'asc' | 'desc';
      }[];
    } | undefined,
    columnVisibility: state.columnVisibility as {
      hiddenColIds: PlTableColumnIdJson[];
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
  focusRow: async (rowKey) => {
    const gridApi = await dataRenderedTracker.promise;
    if (gridApi.isDestroyed()) return false;

    return ensureNodeVisible(gridApi, (row) => isJsonEqual(row.data?.axesKey, rowKey));
  },
  updateSelection: async ({ axesSpec, selectedKeys }) => {
    const gridApi = await dataRenderedTracker.promise;
    if (gridApi.isDestroyed()) return false;

    const axes = selection.value?.axesSpec;
    if (!axes || axes.length !== axesSpec.length) return false;

    const mapping = axesSpec
      .map((spec) => {
        const id = getAxisId(spec);
        return axes.findIndex((axis) => matchAxisId(axis, id));
      });
    const mappingSet = new Set(mapping);
    if (mappingSet.has(-1) || mappingSet.size !== axesSpec.length) return false;

    const selectedNodes = selectedKeys
      .map((key) => canonicalizeJson<PlTableRowId>(mapping.map((index) => key[index])));
    const oldSelectedKeys = gridApi.getServerSideSelectionState()?.toggledNodes ?? [];
    if (!isJsonEqual(oldSelectedKeys, selectedNodes)) {
      gridApi.setServerSideSelectionState({
        selectAll: false,
        toggledNodes: selectedNodes,
      });

      // wait for `onSelectionChanged` to update `selection` model
      const scope = effectScope();
      const { resolve, promise } = Promise.withResolvers();
      scope.run(() => watch(selection, resolve, { once: true }));
      try {
        await promiseTimeout(promise, 500);
      } catch {
        return false;
      } finally {
        scope.stop();
      }
    }
    return true;
  },
});

function getDataColDefs(
  columnDefs: ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[] | null | undefined,
): ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[] {
  const isColDef = <TData, TValue>(
    def: ColDef<TData, TValue> | ColGroupDef<TData>,
  ): def is ColDef<TData, TValue> => !('children' in def);
  if (!columnDefs) return [];
  return columnDefs
    .filter(isColDef)
    .filter((def) => def.colId && def.colId !== PlAgDataTableRowNumberColId);
}

// Propagate columns for filter component
watchCached(
  () => gridOptions.value.columnDefs,
  (columnDefs) => {
    const sourceId = settings.value.sourceId;
    if (sourceId === null) {
      filterableColumns.value = [];
    } else {
      const dataColumns = getDataColDefs(columnDefs);
      filterableColumns.value = dataColumns
        .map((def) => parseJson(def.colId! satisfies string as PlTableColumnIdJson).labeled);
    }
  },
  { immediate: true },
);

// Update AgGrid when settings change
const defaultSelection = createPlSelectionModel();
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
      dataRenderedTracker.reset();

      // No data source selected -> reset state to default
      if (!settings.sourceId) {
        gridApi.updateGridOptions({
          loading: true,
          loadingOverlayComponentParams: {
            ...gridOptions.value.loadingOverlayComponentParams,
            notReady: true,
          } satisfies PlAgOverlayLoadingParams,
          columnDefs: undefined,
          serverSideDatasource: undefined,
        });
        if (selection.value) {
          if (selection.value && !isJsonEqual(selection.value, defaultSelection)) {
            selection.value = createPlSelectionModel();
          }
          gridApi.setServerSideSelectionState({
            selectAll: false,
            toggledNodes: [],
          });
        }
        return;
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
        if (selection.value && oldSettings?.sourceId) {
          if (selection.value && !isJsonEqual(selection.value, defaultSelection)) {
            selection.value = createPlSelectionModel();
          }
          gridApi.setServerSideSelectionState({
            selectAll: false,
            toggledNodes: [],
          });
        }
      }

      // Model updated -> show skeletons instead of data
      const sourceChanged = (settings.model?.sourceId && settings.model.sourceId !== settings.sourceId);
      if (!settings.model || sourceChanged) {
        const state = gridApi.getServerSideGroupLevelState();
        const rowCount = !sourceChanged && state.length > 0
          ? state[0].rowCount
          : 1;
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
      calculateGridOptions({
        generation,
        pfDriver: getRawPlatformaInstance().pFrameDriver,
        model: settings.model,
        sheets: settings.sheets ?? [],
        dataRenderedTracker,
        hiddenColIds: gridState.value.columnVisibility?.hiddenColIds,
        cellButtonAxisParams: {
          showCellButtonForAxisId: props.showCellButtonForAxisId,
          cellButtonInvokeRowsOnDoubleClick:
            props.cellButtonInvokeRowsOnDoubleClick,
          trigger: (key?: PTableKey) => emit('cellButtonClicked', key),
        } satisfies PlAgCellButtonAxisParams,
      }).then((result) => {
        if (gridApi.isDestroyed() || stateGeneration !== generation.value) return;
        const { axesSpec, ...options } = result;
        gridApi.updateGridOptions({
          ...options,
        });
        if (selection.value) {
          // Update selection if axesSpec changed, as order of axes may have changed and so we need to remap selected keys
          const { axesSpec: oldAxesSpec, selectedKeys: oldSelectedKeys } = selection.value;
          if (!isJsonEqual(oldAxesSpec, axesSpec)) {
            if (!oldAxesSpec || axesSpec.length !== oldAxesSpec.length) {
              const newSelection: PlSelectionModel = { axesSpec, selectedKeys: [] };
              if (!isJsonEqual(selection.value, newSelection)) {
                selection.value = newSelection;
              }
              return gridApi.setServerSideSelectionState({
                selectAll: false,
                toggledNodes: [],
              });
            }

            const mapping = oldAxesSpec
              .map(getAxisId)
              .map((id) => axesSpec.findIndex((axis) => matchAxisId(axis, id)));
            const mappingSet = new Set(mapping);
            if (mappingSet.has(-1) || mappingSet.size !== axesSpec.length) {
              const newSelection: PlSelectionModel = { axesSpec, selectedKeys: [] };
              if (!isJsonEqual(selection.value, newSelection)) {
                selection.value = newSelection;
              }
              return gridApi.setServerSideSelectionState({
                selectAll: false,
                toggledNodes: [],
              });
            }

            const selectedNodes = oldSelectedKeys
              .map((key) => mapping.map((index) => key[index]));
            const newSelection: PlSelectionModel = { axesSpec, selectedKeys: selectedNodes };
            if (!isJsonEqual(selection.value, newSelection)) {
              selection.value = newSelection;
            }
            return gridApi.setServerSideSelectionState({
              selectAll: false,
              toggledNodes: selectedNodes.map((key) => canonicalizeJson<PlTableRowId>(key)),
            });
          }
        }
      }).catch((error: unknown) => {
        if (gridApi.isDestroyed() || stateGeneration !== generation.value) return;
        console.trace(error);
      }).finally(() => {
        if (gridApi.isDestroyed() || stateGeneration !== generation.value) return;
        gridApi.updateGridOptions({
          loading: false,
        });
      });
      dataRenderedTracker.promise.then(() => emit('newDataRendered'));
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
      v-if="gridApi && !disableColumnsPanel"
      :api="gridApi"
    />
    <PlTableFiltersV2
      v-if="!disableFiltersPanel"
      v-model="filtersState"
      :settings="filtersSettings"
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
