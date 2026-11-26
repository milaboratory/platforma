<script lang="ts" setup>
import { promiseTimeout, isJsonEqual } from "@milaboratories/helpers";
import type {
  AxisId,
  PlDataTableColumnsMeta,
  PlDataTableGridStateCore,
  PlDataTableStateV2,
  PlSelectionModel,
  PlTableColumnIdJson,
  PTableColumnId,
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
} from "@platforma-sdk/model";
import type { CellRendererSelectorFunc, GridApi, GridState } from "ag-grid-enterprise";
import { AgGridVue } from "ag-grid-vue3";
import { computed, effectScope, nextTick, ref, shallowRef, toRefs, watch, watchEffect } from "vue";
import PlAgCsvExporter from "../PlAgCsvExporter/PlAgCsvExporter.vue";
import { PlAgGridColumnManager } from "../PlAgGridColumnManager";
import PlTableFiltersV2 from "../PlTableFilters/PlTableFiltersV2.vue";
import { PlTableFastSearch } from "../PlTableFastSearch";
import PlAgDataTableSheets from "./PlAgDataTableSheets.vue";
import PlAgRowCount from "./PlAgRowCount.vue";
import { DeferredCircular, ensureNodeVisible } from "./sources/focus-row";
import { PlAgDataTableRowNumberColId } from "./sources/row-number";
import type { PlAgCellButtonAxisParams } from "./sources/table-source-v2";
import { calculateGridOptions, effectiveVisibility } from "./sources/table-source-v2";
import { createGridRestoreState, isStoredStateApplied, readGridReport } from "./sources/grid-state";
import { useTableState } from "./sources/table-state-v2";
import type {
  PlAgDataTableV2Controller,
  PlAgDataTableV2Row,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
  PlDataTableSettingsV2,
  PlTableRowId,
} from "./types";
import { useFilterableColumns } from "./compositions/useFilterableColumns";
import { useGrid } from "./compositions/useGrid";
import { AgGridTheme } from "../../AgGridVue/AgGridTheme";

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
  selection,
  noRowsText: props.noRowsText,
  runningText: props.runningText,
  loadingText: props.loadingText,
  notReadyText: props.notReadyText,
  cellRendererSelector: props.cellRendererSelector,
});
let isReloading = false;
/** Source the grid's columns were built for; `null` while the grid has none. */
const boundSourceId = shallowRef<null | string>(null);
gridOptions.value.onGridPreDestroyed = (event) => {
  if (!isReloading) saveGridState(event.api, makePartialState(event.api.getState()));
  gridOptions.value.initialState = restoreState.value;
  // A replaced grid destroyed after its successor is ready must leave the successor's api in place
  if (gridApi.value?.getGridId() === event.api.getGridId()) gridApi.value = null;
};
gridOptions.value.onRowDoubleClicked = (event) => {
  if (event.data && event.data.axesKey) emit("rowDoubleClicked", event.data.axesKey);
};
gridOptions.value.onStateUpdated = (event) => {
  saveGridState(event.api, makePartialState(event.state));
  // Keep initialState in step with the stored grid state, so the grid recreated
  // by the reload watch below comes back with it.
  gridOptions.value.initialState = restoreState.value;

  if (!isJsonEqual(event.sources, ["columnSizing"])) {
    event.api.autoSizeColumns(
      event.api
        .getAllDisplayedColumns()
        .filter((column) => column.getColId() !== PlAgDataTableRowNumberColId),
    );
  }
};

const [filterableColumns] = useFilterableColumns(
  () => settings.value.sourceId,
  () => gridOptions.value.columnDefs ?? null,
);
const defaultFilters = computed(() =>
  settings.value.sourceId !== null ? settings.value.model?.defaultFilters : undefined,
);
const {
  sourceId: shownSourceId,
  gridState,
  sorting,
  hiddenColIds,
  getEntry,
  updateGrid,
  sheetsState,
  searchString,
  filtersState,
  defaultFiltersState,
  resetDefaultFilters,
} = useTableState(tableState, settings, defaultFilters);
const sheets = computed(() => (settings.value.sourceId !== null ? settings.value.sheets : []));
const restoreState = computed(() =>
  createGridRestoreState({
    gridState: gridState.value,
    sorting: sorting.value,
    hiddenColIds: hiddenColIds.value,
  }),
);
gridOptions.value.initialState = restoreState.value;

/**
 * Store what the grid reports under the source its columns belong to: while
 * the table switches sources the grid still holds the previous source's
 * columns, and their state must not land on the new source.
 */
function saveGridState(api: GridApi<PlAgDataTableV2Row>, reported: PlDataTableGridStateCore) {
  const sourceId = boundSourceId.value;
  // AG Grid reports an entirely empty state until its columns have been taken
  // into its own state. Such a report says nothing about the user's choices, and
  // reading defaults from the live columns at that point would invent some.
  // Wait for the grid to say something about itself; it always does once its
  // columns are in.
  if (sourceId === null || isJsonEqual(reported, {})) return;
  updateGrid(
    sourceId,
    readGridReport(reported, getEntry(sourceId), () =>
      getDefaultHiddenColIds(api, getColumnsMeta()),
    ),
  );
}

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

/** Sidecar display meta is only on the `model` branch of the settings union. */
function getColumnsMeta(): PlDataTableColumnsMeta | undefined {
  return "model" in props.settings ? props.settings.model?.columnsMeta : undefined;
}

function getDefaultHiddenColIds(
  api: GridApi<PlAgDataTableV2Row>,
  columnsMeta: PlDataTableColumnsMeta | undefined,
): PlTableColumnIdJson[] {
  const cols = api.getAllGridColumns();
  if (!cols) return [];

  return cols
    .filter((col) => {
      const spec = col.getColDef().context as PTableColumnSpec | undefined;
      return (
        spec !== undefined &&
        spec.type === "column" &&
        effectiveVisibility(spec, columnsMeta) === "optional"
      );
    })
    .map((col) => col.getColId() as PlTableColumnIdJson);
}

// Reload AgGrid when new state arrives from server, or when the grid takes the
// columns of a source whose stored state it does not show yet
const reloadKey = ref(0);
watch(
  () => [gridApi.value, restoreState.value, boundSourceId.value] as const,
  ([gridApi, restoreState, boundSourceId]) => {
    if (!gridApi || gridApi.isDestroyed() || boundSourceId !== shownSourceId.value) return;
    const selfState = makePartialState(gridApi.getState());
    const gridColIds = new Set(
      (gridApi.getAllGridColumns() ?? []).map((column) => column.getColId() as PlTableColumnIdJson),
    );
    if (
      !isJsonEqual(restoreState, {}) &&
      !isStoredStateApplied(restoreState, selfState, gridColIds)
    ) {
      isReloading = true;
      gridOptions.value.initialState = restoreState;
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
    try {
      // Hide no rows overlay if it is shown, or else loading overlay will not be shown
      gridApi.hideOverlay();
      dataRenderedTracker.reset();

      // No data source selected -> reset state to default
      if (settings.sourceId === null) {
        ++generation.value;
        boundSourceId.value = null;
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

      // The model is between handles — it is recomputing. Nothing is started here,
      // so moving the generation would only cancel the calculation in flight and
      // leave whatever it was going to do (not least taking the loading overlay
      // down) undone — which is how the table came to sit on "Loading data…"
      // forever. The exception is a change of source: then the calculation in
      // flight belongs to the old one and must not be allowed to land under the
      // new settings.
      if (
        settings.model?.fullTableHandle === undefined ||
        settings.model?.visibleTableHandle === undefined
      ) {
        if (settings.sourceId !== oldSettings?.sourceId) ++generation.value;
        // A grid that already shows a table keeps showing it; one that is still
        // waiting says why.
        if (gridApi.getGridOption("loading") === true) {
          setLoadingVariant(gridApi, settings.pending ? "running" : "not-ready");
        }
        return;
      }

      ++generation.value;

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

      // Model built for another source -> show skeletons until it catches up.
      // A model that reports no source was built from a state that names none,
      // or does not take the state at all, and is shown as it is.
      const sourceChanged =
        settings.model.sourceId !== null && settings.model.sourceId !== settings.sourceId;
      if (sourceChanged) {
        if (gridApi.getGridOption("loading") === true) setLoadingVariant(gridApi, "loading");
        return gridApi.updateGridOptions({
          serverSideDatasource: {
            getRows: (params) => {
              params.success({ rowData: [], rowCount: 1 });
            },
          },
        });
      }

      // Model ready -> calculate new state
      const stateGeneration = generation.value;
      const stateSourceId = settings.sourceId;
      calculateGridOptions({
        generation,
        pfDriver: getRawPlatformaInstance().pFrameDriver,
        fullTableHandle: settings.model?.fullTableHandle,
        visibleTableHandle: settings.model?.visibleTableHandle,
        columnsMeta: settings.model?.columnsMeta,
        sheets: settings.sheets ?? [],
        sheetsState: sheetsState.value,
        dataRenderedTracker,
        hiddenColIds: hiddenColIds.value?.map((id) => canonicalizeJson<PTableColumnId>(id)),
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
          boundSourceId.value = stateSourceId;
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
          // Only the current calculation may take the overlay down: a superseded
          // one would hide the overlay the newer settings just put up.
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

function setLoadingVariant(
  api: GridApi<PlAgDataTableV2Row>,
  variant: PlAgOverlayLoadingParams["variant"],
): void {
  api.updateGridOptions({
    loadingOverlayComponentParams: {
      ...gridOptions.value.loadingOverlayComponentParams,
      variant,
    } satisfies PlAgOverlayLoadingParams,
  });
}

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
  <div data-testid="pl-ag-data-table" :class="$style.container">
    <PlAgGridColumnManager v-if="gridApi && !disableColumnsPanel" :api="gridApi" />
    <PlTableFiltersV2
      v-if="!disableFiltersPanel"
      :filters="filtersState"
      :default-filters="defaultFiltersState"
      :pframe-handle="'model' in settings ? settings?.model?.fullPframeHandle : undefined"
      :columns="filterableColumns"
      :columns-meta="getColumnsMeta()"
      @updateFilters="(v) => (filtersState = v)"
      @resetDefaultFilters="resetDefaultFilters"
      @updateDefaultFilters="(v) => (defaultFiltersState = v)"
      v-model="filtersState"
    />
    <PlAgCsvExporter
      v-if="gridApi && showExportButton"
      :api="gridApi"
      :table-handle="'model' in settings ? settings?.model?.visibleTableHandle : undefined"
      :columns-meta="getColumnsMeta()"
    />
    <PlAgDataTableSheets
      :sheets="sheets"
      :state="sheetsState"
      :on-change="(state) => (sheetsState = state)"
    >
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
      data-testid="pl-ag-data-table-grid"
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
