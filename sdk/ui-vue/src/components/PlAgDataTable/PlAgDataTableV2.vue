<script lang="ts" setup>
import { promiseTimeout, isJsonEqual } from "@milaboratories/helpers";
import type {
  AxisId,
  PlDataTableGridStateCore,
  PlDataTableStateV2,
  PlSelectionModel,
  PlTableColumnIdJson,
  PTableColumnSpec,
  PTableKey,
} from "@platforma-sdk/model";
import {
  getRawPlatformaInstance,
  createPlSelectionModel,
  matchAxisId,
  getAxisId,
  canonicalizeJson,
  isAbortError,
  isColumnOptional,
} from "@platforma-sdk/model";
import type { CellRendererSelectorFunc, GridApi, GridState } from "ag-grid-enterprise";
import { AgGridVue } from "ag-grid-vue3";
import { computed, effectScope, nextTick, ref, toRefs, watch, watchEffect } from "vue";
import { AgGridTheme } from "../../aggrid";
import PlAgCsvExporter from "../PlAgCsvExporter/PlAgCsvExporter.vue";
import { PlAgGridColumnManager } from "../PlAgGridColumnManager";
import PlTableFiltersV2 from "../PlTableFilters/PlTableFiltersV2.vue";
import { PlTableFastSearch } from "../PlTableFastSearch";
import PlAgDataTableSheets from "./PlAgDataTableSheets.vue";
import PlAgRowCount from "./PlAgRowCount.vue";
import { DeferredCircular, ensureNodeVisible } from "./sources/focus-row";
import { PlAgDataTableRowNumberColId } from "./sources/row-number";
import type { PlAgCellButtonAxisParams } from "./sources/table-source-v2";
import { calculateGridOptions } from "./sources/table-source-v2";
import { useTableState } from "./sources/table-state-v2";
import type {
  PlAgDataTableV2Controller,
  PlAgDataTableV2Row,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
  PlDataTableSettingsV2,
  PlDataTableSheetsSettings,
  PlTableRowId,
} from "./types";
import { useFilterableColumns } from "./compositions/useFilterableColumns";
import { useGrid } from "./compositions/useGrid";

const tableState = defineModel<PlDataTableStateV2>({
  required: true,
});
/** Warning: selection model value updates are ignored, use updateSelection instead */
const selection = defineModel<PlSelectionModel>("selection");
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

  /** @see {@link PlAgOverlayLoadingParams.runningText} */
  runningText?: string;

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

const dataRenderedTracker = new DeferredCircular<GridApi<PlAgDataTableV2Row>>();
const { gridApi, gridOptions } = useGrid({
  selection: selection.value,
  noRowsText: props.noRowsText,
  runningText: props.runningText,
  loadingText: props.loadingText,
  notReadyText: props.notReadyText,
  cellRendererSelector: props.cellRendererSelector,
});
let isReloading = false;
gridOptions.value.onGridPreDestroyed = (event) => {
  if (!isReloading) {
    gridOptions.value.initialState = gridState.value = normalizeColumnVisibility(
      makePartialState(event.api.getState()),
      gridState.value,
      event.api,
    );
  }
  gridApi.value = null;
};
gridOptions.value.onRowDoubleClicked = (event) => {
  if (event.data && event.data.axesKey) emit("rowDoubleClicked", event.data.axesKey);
};
gridOptions.value.onStateUpdated = (event) => {
  const partialState = normalizeColumnVisibility(
    makePartialState(event.state),
    gridState.value,
    event.api,
  );
  // We have to keep initialState synchronized with gridState for gridState recovery after key updating.
  gridOptions.value.initialState = gridState.value = partialState;

  if (!isJsonEqual(event.sources, ["columnSizing"])) {
    event.api.autoSizeColumns(
      event.api
        .getAllDisplayedColumns()
        .filter((column) => column.getColId() !== PlAgDataTableRowNumberColId),
    );
  }
};

const [filterableColumns, visibleFilterableColumns] = useFilterableColumns(
  () => settings.value.sourceId,
  () => gridOptions.value.columnDefs ?? null,
);
const { gridState, sheetsState, filtersState, searchString } = useTableState(
  tableState,
  settings,
  visibleFilterableColumns,
);
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
gridOptions.value.initialState = gridState.value;

// Restore proper types erased by AgGrid
function makePartialState(state: GridState): PlDataTableGridStateCore {
  return {
    columnOrder: state.columnOrder as
      | {
          orderedColIds: PlTableColumnIdJson[];
        }
      | undefined,
    sort: state.sort as
      | {
          sortModel: {
            colId: PlTableColumnIdJson;
            sort: "asc" | "desc";
          }[];
        }
      | undefined,
    columnVisibility: state.columnVisibility as
      | {
          hiddenColIds: PlTableColumnIdJson[];
        }
      | undefined,
  };
}

// AG Grid returns columnVisibility: undefined when all columns are visible.
// We need to distinguish "no state yet" (use isColumnOptional defaults) from
// "user explicitly showed all columns" (store []). This function normalizes
// the undefined from AG Grid based on the previous state.
function normalizeColumnVisibility(
  partialState: PlDataTableGridStateCore,
  prevState: PlDataTableGridStateCore,
  api: GridApi<PlAgDataTableV2Row>,
): PlDataTableGridStateCore {
  if (partialState.columnVisibility !== undefined) return partialState;

  if (prevState.columnVisibility !== undefined) {
    // Had explicit visibility state before → user made all columns visible → store [].
    return { ...partialState, columnVisibility: { hiddenColIds: [] } };
  }

  // No previous explicit state → compute defaults from current columns
  // to replicate: hide: hiddenColIds?.includes(colId) ?? isColumnOptional(spec.spec)
  const defaultHidden = getDefaultHiddenColIds(api);
  if (defaultHidden.length > 0) {
    return { ...partialState, columnVisibility: { hiddenColIds: defaultHidden } };
  }

  return partialState;
}

function getDefaultHiddenColIds(api: GridApi<PlAgDataTableV2Row>): PlTableColumnIdJson[] {
  const cols = api.getAllGridColumns();
  if (!cols) return [];
  return cols
    .filter((col) => {
      const spec = col.getColDef().context as PTableColumnSpec | undefined;
      return spec && isColumnOptional(spec.spec);
    })
    .map((col) => col.getColId() as PlTableColumnIdJson);
}

// Normalize columnVisibility for comparison: undefined and { hiddenColIds: [] } are equivalent.
function stateForReloadCompare(state: PlDataTableGridStateCore): PlDataTableGridStateCore {
  const cv = state.columnVisibility;
  const normalizedCv = !cv || cv.hiddenColIds.length === 0 ? undefined : state.columnVisibility;
  return { ...state, columnVisibility: normalizedCv };
}

// Reload AgGrid when new state arrives from server
const reloadKey = ref(0);
watch(
  () => [gridApi.value, gridState.value] as const,
  ([gridApi, gridState]) => {
    if (!gridApi || gridApi.isDestroyed()) return;
    const selfState = makePartialState(gridApi.getState());
    if (
      !isJsonEqual(gridState, {}) &&
      !isJsonEqual(stateForReloadCompare(gridState), stateForReloadCompare(selfState))
    ) {
      isReloading = true;
      gridOptions.value.initialState = gridState;
      ++reloadKey.value;
      nextTick(() => {
        isReloading = false;
      });
    }
  },
);

// Make cellRendererSelector reactive
const cellRendererSelector = computed(() => props.cellRendererSelector ?? null);
watch(
  () => [gridApi.value, cellRendererSelector.value] as const,
  ([gridApi, cellRendererSelector]) => {
    if (!gridApi || gridApi.isDestroyed()) return;
    gridApi.setGridOption("defaultColDef", {
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

    const mapping = axesSpec.map((spec) => {
      const id = getAxisId(spec);
      return axes.findIndex((axis) => matchAxisId(axis, id));
    });
    const mappingSet = new Set(mapping);
    if (mappingSet.has(-1) || mappingSet.size !== axesSpec.length) return false;

    const selectedNodes = selectedKeys.map((key) =>
      canonicalizeJson<PlTableRowId>(mapping.map((index) => key[index])),
    );
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

// Update AgGrid when settings change
const defaultSelection = createPlSelectionModel();
let oldSettings: PlDataTableSettingsV2 | null = null;
const generation = ref(0);
watch(
  () => [gridApi.value, settings.value] as const,
  ([gridApi, settings]) => {
    // Wait for AgGrid reinitialization, gridApi will eventually become initialized
    if (!gridApi || gridApi.isDestroyed()) return;
    // Verify that this is not a false watch trigger
    if (isJsonEqual(settings, oldSettings)) return;
    ++generation.value;
    try {
      // Hide no rows overlay if it is shown, or else loading overlay will not be shown
      gridApi.hideOverlay();
      dataRenderedTracker.reset();

      // No data source selected -> reset state to default
      if (settings.sourceId === null) {
        gridApi.updateGridOptions({
          loading: true,
          loadingOverlayComponentParams: {
            ...gridOptions.value.loadingOverlayComponentParams,
            variant: settings.pending ? "running" : "not-ready",
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
            variant: "loading",
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
      const sourceChanged =
        settings.model?.sourceId && settings.model.sourceId !== settings.sourceId;
      if (!settings.model || sourceChanged) {
        const state = gridApi.getServerSideGroupLevelState();
        const rowCount = !sourceChanged && state.length > 0 ? state[0].rowCount : 1;
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
          cellButtonInvokeRowsOnDoubleClick: props.cellButtonInvokeRowsOnDoubleClick,
          trigger: (key?: PTableKey) => emit("cellButtonClicked", key),
        } satisfies PlAgCellButtonAxisParams,
      })
        .then((result) => {
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

              const selectedNodes = oldSelectedKeys.map((key) =>
                mapping.map((index) => key[index]),
              );
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
        })
        .catch((error: unknown) => {
          if (gridApi.isDestroyed() || stateGeneration !== generation.value) return;
          if (isAbortError(error)) return;
          console.trace(error);
        })
        .finally(() => {
          if (gridApi.isDestroyed() || stateGeneration !== generation.value) return;
          gridApi.updateGridOptions({
            loading: false,
          });
        });
      dataRenderedTracker.promise.then(() => emit("newDataRendered"));
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
    runningText: props.runningText,
    notReadyText: props.notReadyText,
    noRowsText: props.noRowsText,
  }),
  ({ gridApi, loadingText, runningText, notReadyText, noRowsText }) => {
    if (!gridApi || gridApi.isDestroyed()) return;
    gridApi.updateGridOptions({
      loadingOverlayComponentParams: {
        ...gridOptions.value.loadingOverlayComponentParams,
        loadingText,
        runningText,
        notReadyText,
      },
      noRowsOverlayComponentParams: {
        ...gridOptions.value.noRowsOverlayComponentParams,
        text: noRowsText,
      },
    });
  },
);

watchEffect(() => {
  if (!gridApi.value || gridApi.value?.isDestroyed()) return;
  gridApi.value.updateGridOptions({
    statusBar: gridOptions.value.loading
      ? undefined
      : {
          statusPanels: [{ statusPanel: PlAgRowCount, align: "left" }],
        },
  });
});
</script>

<template>
  <div :class="$style.container">
    <PlAgGridColumnManager v-if="gridApi && !disableColumnsPanel" :api="gridApi" />
    <PlTableFiltersV2
      v-if="!disableFiltersPanel"
      v-model="filtersState"
      :columns="filterableColumns"
    />
    <PlAgCsvExporter v-if="gridApi && showExportButton" :api="gridApi" />
    <PlAgDataTableSheets v-model="sheetsState" :settings="sheetsSettings">
      <template v-if="$slots['before-sheets']" #before>
        <slot name="before-sheets" />
      </template>
      <template v-if="$slots['after-sheets']" #after>
        <slot name="after-sheets" />
      </template>
    </PlAgDataTableSheets>
    <PlTableFastSearch v-model="searchString" />
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
