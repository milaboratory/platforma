<script lang="ts" setup>
import { isJsonEqual } from "@milaboratories/helpers";
import type {
  AxisId,
  PlDataTableGridStateCore,
  PlDataTableStateV2,
  PlSelectionModel,
  PlTableColumnIdJson,
  PTableColumnSpec,
  PTableKey,
} from "@platforma-sdk/model";
import { getRawPlatformaInstance, isColumnOptional } from "@platforma-sdk/model";
import type { CellRendererSelectorFunc, GridApi } from "ag-grid-enterprise";
import { AgGridVue } from "ag-grid-vue3";
import { computed, onUnmounted, ref, toRefs, watch } from "vue";
import PlAgCsvExporter from "../PlAgCsvExporter/PlAgCsvExporter.vue";
import { PlAgGridColumnManager } from "../PlAgGridColumnManager";
import PlTableFiltersV2 from "../PlTableFilters/PlTableFiltersV2.vue";
import { PlTableFastSearch } from "../PlTableFastSearch";
import PlAgDataTableSheets from "../PlAgDataTable/PlAgDataTableSheets.vue";
import { DeferredCircular, ensureNodeVisible } from "../PlAgDataTable/sources/focus-row";
import { PlAgDataTableRowNumberColId } from "../PlAgDataTable/sources/row-number";
import type {
  PlAgDataTableV2Controller,
  PlAgDataTableV2Row,
  PlDataTableSettingsV2,
  PlDataTableSheetsSettings,
} from "../PlAgDataTable/types";
import type { CellButtonAxisParameters } from "./types";
import { useGridOptions } from "./composables/useGridOptions";
import { useTableState } from "./composables/useTableState";
import { useOverlays } from "./composables/useOverlays";
import { useColumnPipeline } from "./composables/useColumnPipeline";
import { useSelectionManager } from "./composables/useSelectionManager";
import { useSettingsMachine } from "./composables/useSettingsMachine";
import { useRowNumberColumn } from "./composables/useRowNumberColumn";
import { useGridStateReload } from "./composables/useGridStateReload";
import { makePartialState } from "./utils/gridState";
import { AgGridTheme } from "../../AgGridVue/AgGridTheme";

// ── v-models ────────────────────────────────────────────────────────────

const tableState = defineModel<PlDataTableStateV2>({ required: true });
const selection = defineModel<PlSelectionModel>("selection");

// ── props ───────────────────────────────────────────────────────────────

const props = defineProps<{
  settings: Readonly<PlDataTableSettingsV2>;
  disableColumnsPanel?: boolean;
  disableFiltersPanel?: boolean;
  showExportButton?: boolean;
  showCellButtonForAxisId?: AxisId;
  cellButtonInvokeRowsOnDoubleClick?: boolean;
  loadingText?: string;
  runningText?: string;
  notReadyText?: string;
  noRowsText?: string;
  cellRendererSelector?: CellRendererSelectorFunc<PlAgDataTableV2Row>;
}>();
const { settings } = toRefs(props);

// ── emits ───────────────────────────────────────────────────────────────

const emit = defineEmits<{
  rowDoubleClicked: [key?: PTableKey];
  cellButtonClicked: [key?: PTableKey];
  newDataRendered: [];
}>();

// ── template refs ───────────────────────────────────────────────────────

const measureElement = ref<HTMLSpanElement | null>(null);

// ── data rendering tracker ──────────────────────────────────────────────

const dataRenderedTracker = new DeferredCircular<GridApi<PlAgDataTableV2Row>>();

// ── composables: useGridOptions ─────────────────────────────────────────

const { gridApi, gridOptions, updateOptions, setOption } = useGridOptions({
  selection,
  cellRendererSelector: props.cellRendererSelector,
  overlayParams: {
    loadingText: props.loadingText,
    runningText: props.runningText,
    notReadyText: props.notReadyText,
    noRowsText: props.noRowsText,
  },
  onGridReady: (api) => {
    rowNumberColumn.setupListeners(api);
  },
  onGridPreDestroyed: (api) => {
    if (!isReloading.value) {
      const partialState = normalizeColumnVisibility(
        makePartialState(api.getState()),
        gridState.value,
        api,
      );
      gridOptions.value = { ...gridOptions.value, initialState: partialState };
      gridState.value = partialState;
    }
  },
  onStateUpdated: (event) => {
    const partialState = normalizeColumnVisibility(
      makePartialState(event.state),
      gridState.value,
      event.api,
    );
    gridOptions.value = { ...gridOptions.value, initialState: partialState };
    gridState.value = partialState;

    if (!isJsonEqual(event.sources, ["columnSizing"])) {
      event.api.autoSizeColumns(
        event.api
          .getAllDisplayedColumns()
          .filter((column) => column.getColId() !== PlAgDataTableRowNumberColId),
      );
    }
  },
  onSelectionChanged: (event) => {
    selectionManager.onSelectionChanged(event);
  },
  onRowDoubleClicked: (event) => {
    if (event.data !== undefined && event.data !== null && event.data.axesKey !== undefined) {
      emit("rowDoubleClicked", event.data.axesKey);
    }
  },
});

// ── composables: useTableState ──────────────────────────────────────────

const visibleFilterableColumnsRef = ref<PTableColumnSpec[]>([]);
const { gridState, sheetsState, filtersState, searchString } = useTableState(
  tableState,
  settings,
  visibleFilterableColumnsRef,
);

// Set initial state from persisted gridState
gridOptions.value = { ...gridOptions.value, initialState: gridState.value };

// ── composables: useOverlays ────────────────────────────────────────────

const { showLoading, hideLoading, showNoRows, updateTexts, isLoading } = useOverlays({
  gridApi,
  updateOptions,
  initialLoadingText: props.loadingText,
  initialRunningText: props.runningText,
  initialNotReadyText: props.notReadyText,
  initialNoRowsText: props.noRowsText,
});

// ── composables: useColumnPipeline ──────────────────────────────────────

const { runPipeline } = useColumnPipeline({
  pfDriver: getRawPlatformaInstance().pFrameDriver,
});

// ── composables: useSelectionManager ────────────────────────────────────

const selectionManager = useSelectionManager({
  selection,
  gridApi,
  dataRenderedTracker,
});

// ── composables: useRowNumberColumn ─────────────────────────────────────

const rowNumberColumn = useRowNumberColumn({
  gridApi,
  measureElement,
});

// ── composables: useGridStateReload ─────────────────────────────────────

const { reloadKey, isReloading } = useGridStateReload({
  gridApi,
  gridState,
  setInitialState: (state) => {
    gridOptions.value = { ...gridOptions.value, initialState: state };
  },
});

// ── composables: useSettingsMachine ─────────────────────────────────────

const filterableColumnsRef = ref<PTableColumnSpec[]>([]);

const { dispose: disposeSettingsMachine } = useSettingsMachine({
  settings,
  gridApi,
  dataRenderedTracker,
  showLoading,
  hideLoading,
  updateOptions,
  clearSelection: () => selectionManager.clearSelection(),
  runColumnPipeline: (options) => runPipeline(options),
  onPipelineComplete: (result) => {
    const { columnDefs, datasource, axesSpec, filterableColumns, visibleFilterableColumns } =
      result;
    updateOptions({
      columnDefs,
      serverSideDatasource: datasource,
    });
    filterableColumnsRef.value = filterableColumns;
    visibleFilterableColumnsRef.value = visibleFilterableColumns;
    selectionManager.handleAxesSpecChange(axesSpec);
  },
  onPipelineError: (error) => {
    console.trace(error);
  },
  onNewDataRendered: () => {
    emit("newDataRendered");
  },
  getHiddenColIds: () => gridState.value.columnVisibility?.hiddenColIds,
  getCellButtonAxisParameters: (): CellButtonAxisParameters | undefined => {
    if (props.showCellButtonForAxisId === undefined) return undefined;
    return {
      showCellButtonForAxisId: props.showCellButtonForAxisId,
      cellButtonInvokeRowsOnDoubleClick: props.cellButtonInvokeRowsOnDoubleClick,
      trigger: (key?: PTableKey) => emit("cellButtonClicked", key),
    };
  },
});

onUnmounted(() => {
  disposeSettingsMachine();
});

// ── reactive: clear filterable columns when source goes away ───────────

watch(
  () => settings.value.sourceId,
  (sourceId) => {
    if (sourceId === null) {
      filterableColumnsRef.value = [];
      visibleFilterableColumnsRef.value = [];
    }
  },
);

// ── derived: sheets settings ────────────────────────────────────────────

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

// ── reactive: cellRendererSelector ──────────────────────────────────────

const cellRendererSelector = computed(() => props.cellRendererSelector ?? null);
watch(
  () => [gridApi.value, cellRendererSelector.value] as const,
  ([api, renderer]) => {
    if (api === null || api.isDestroyed()) return;
    setOption("defaultColDef", {
      ...gridOptions.value.defaultColDef,
      cellRendererSelector: renderer ?? undefined,
    });
  },
);

// ── reactive: overlay texts ─────────────────────────────────────────────

watch(
  () => ({
    gridApi: gridApi.value,
    loadingText: props.loadingText,
    runningText: props.runningText,
    notReadyText: props.notReadyText,
    noRowsText: props.noRowsText,
  }),
  ({ gridApi: api, loadingText, runningText, notReadyText, noRowsText }) => {
    if (api === null || api.isDestroyed()) return;
    updateTexts({ loadingText, runningText, notReadyText, noRowsText });
  },
);

// ── helpers: column visibility normalization ────────────────────────────

function normalizeColumnVisibility(
  partialState: PlDataTableGridStateCore,
  prevState: PlDataTableGridStateCore,
  api: GridApi<PlAgDataTableV2Row>,
): PlDataTableGridStateCore {
  if (partialState.columnVisibility !== undefined) return partialState;

  if (prevState.columnVisibility !== undefined) {
    return { ...partialState, columnVisibility: { hiddenColIds: [] } };
  }

  const defaultHidden = getDefaultHiddenColIds(api);
  if (defaultHidden.length > 0) {
    return { ...partialState, columnVisibility: { hiddenColIds: defaultHidden } };
  }

  return partialState;
}

function getDefaultHiddenColIds(api: GridApi<PlAgDataTableV2Row>): PlTableColumnIdJson[] {
  const cols = api.getAllGridColumns();
  if (cols === undefined || cols === null) return [];

  return cols
    .filter((col) => {
      const spec = col.getColDef().context as PTableColumnSpec | undefined;
      return spec !== undefined && spec.type === "column" && isColumnOptional(spec.spec);
    })
    .map((col) => col.getColId() as PlTableColumnIdJson);
}

// ── exposed controller ──────────────────────────────────────────────────

defineExpose<PlAgDataTableV2Controller>({
  focusRow: async (rowKey) => {
    const api = await dataRenderedTracker.promise;
    if (api.isDestroyed()) return false;
    return ensureNodeVisible(api, (row) => isJsonEqual(row.data?.axesKey, rowKey));
  },
  updateSelection: (options) => selectionManager.updateSelection(options),
});
</script>

<template>
  <div :class="$style.container">
    <PlAgGridColumnManager v-if="gridApi !== null && !disableColumnsPanel" :api="gridApi" />
    <PlTableFiltersV2
      v-if="!disableFiltersPanel"
      v-model="filtersState"
      :pframe-handle="'model' in settings ? settings?.model?.fullPframeHandle : undefined"
      :columns="filterableColumnsRef"
    />
    <PlAgCsvExporter v-if="gridApi !== null && showExportButton" :api="gridApi" />
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
    <span
      ref="measureElement"
      :style="{
        visibility: 'hidden',
        position: 'absolute',
        boxSizing: 'border-box',
        padding: '15.5px',
        border: '1px solid',
        width: 'auto',
      }"
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
