import { isNil } from "es-toolkit";
import type { Ref, ShallowRef } from "vue";
import { shallowRef } from "vue";
import type {
  CellRendererSelectorFunc,
  GridApi,
  GridOptions,
  ManagedGridOptionKey,
  ManagedGridOptions,
  RowDoubleClickedEvent,
  SelectionChangedEvent,
  StateUpdatedEvent,
} from "ag-grid-enterprise";
import type { PlSelectionModel } from "@platforma-sdk/model";
import type {
  PlAgDataTableV2Row,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
} from "../../PlAgDataTable/types";
import PlAgOverlayLoading from "../../PlAgDataTable/PlAgOverlayLoading.vue";
import PlAgOverlayNoRows from "../../PlAgDataTable/PlAgOverlayNoRows.vue";
import PlAgRowCount from "../../PlAgDataTable/PlAgRowCount.vue";
import { CACHE_BLOCK_SIZE, MAX_BLOCKS_IN_CACHE, BLOCK_LOAD_DEBOUNCE_MS } from "../constants";

export type UseGridOptionsParameters = {
  selection: Ref<PlSelectionModel | undefined>;
  cellRendererSelector?: CellRendererSelectorFunc<PlAgDataTableV2Row>;
  overlayParams: {
    loadingText?: string;
    runningText?: string;
    notReadyText?: string;
    noRowsText?: string;
  };
  onGridReady?: (api: GridApi<PlAgDataTableV2Row>) => void;
  onGridPreDestroyed?: (api: GridApi<PlAgDataTableV2Row>) => void;
  onStateUpdated?: (event: StateUpdatedEvent<PlAgDataTableV2Row>) => void;
  onSelectionChanged?: (event: SelectionChangedEvent<PlAgDataTableV2Row>) => void;
  onRowDoubleClicked?: (event: RowDoubleClickedEvent<PlAgDataTableV2Row>) => void;
};

export type UseGridOptionsReturn = {
  gridApi: ShallowRef<GridApi<PlAgDataTableV2Row> | null>;
  gridOptions: ShallowRef<GridOptions<PlAgDataTableV2Row>>;
  updateOptions: (partial: Partial<ManagedGridOptions<PlAgDataTableV2Row>>) => void;
  setOption: <K extends ManagedGridOptionKey>(
    key: K,
    value: GridOptions<PlAgDataTableV2Row>[K],
  ) => void;
};

export function useGridOptions(params: UseGridOptionsParameters): UseGridOptionsReturn {
  const gridApi = shallowRef<GridApi<PlAgDataTableV2Row> | null>(null);

  const gridOptions = shallowRef<GridOptions<PlAgDataTableV2Row>>({
    animateRows: false,
    suppressColumnMoveAnimation: true,
    cellSelection: isNil(params.selection.value),
    autoSizeStrategy: { type: "fitCellContents" },
    rowSelection: !isNil(params.selection.value)
      ? {
          mode: "multiRow",
          selectAll: "all",
          groupSelects: "self",
          checkboxes: false,
          headerCheckbox: false,
          enableClickSelection: false,
        }
      : undefined,
    defaultColDef: {
      suppressHeaderMenuButton: true,
      sortingOrder: ["desc", "asc", null],
      cellRendererSelector: params.cellRendererSelector,
    },
    maintainColumnOrder: true,
    localeText: {
      loadingError: "...",
    },
    rowModelType: "serverSide",
    cacheBlockSize: CACHE_BLOCK_SIZE,
    maxBlocksInCache: MAX_BLOCKS_IN_CACHE,
    blockLoadDebounceMillis: BLOCK_LOAD_DEBOUNCE_MS,
    serverSideSortAllLevels: true,
    suppressServerSideFullWidthLoadingRow: true,
    getRowId: (rowIdParams) => rowIdParams.data.id,
    loading: true,
    loadingOverlayComponent: PlAgOverlayLoading,
    loadingOverlayComponentParams: {
      variant: "not-ready",
      loadingText: params.overlayParams.loadingText,
      runningText: params.overlayParams.runningText,
      notReadyText: params.overlayParams.notReadyText,
    } satisfies PlAgOverlayLoadingParams,
    noRowsOverlayComponent: PlAgOverlayNoRows,
    noRowsOverlayComponentParams: {
      text: params.overlayParams.noRowsText,
    } satisfies PlAgOverlayNoRowsParams,
    statusBar: {
      statusPanels: [
        {
          statusPanel: PlAgRowCount,
          align: "left",
        },
      ],
    },
    defaultCsvExportParams: {
      allColumns: true,
      suppressQuotes: true,
      columnSeparator: "\t",
      fileName: "table.tsv",
    },
    onGridReady: (event) => {
      gridApi.value = event.api;
      if (!isNil(params.onGridReady)) {
        params.onGridReady(event.api);
      }
    },
    onGridPreDestroyed: (event) => {
      if (!isNil(params.onGridPreDestroyed)) {
        params.onGridPreDestroyed(event.api);
      }
      gridApi.value = null;
    },
    onStateUpdated: (event) => {
      if (!isNil(params.onStateUpdated)) {
        params.onStateUpdated(event);
      }
    },
    onSelectionChanged: (event) => {
      if (!isNil(params.onSelectionChanged)) {
        params.onSelectionChanged(event);
      }
    },
    onRowDoubleClicked: (event) => {
      if (!isNil(params.onRowDoubleClicked)) {
        params.onRowDoubleClicked(event);
      }
    },
  });

  function updateOptions(partial: Partial<ManagedGridOptions<PlAgDataTableV2Row>>): void {
    gridOptions.value = {
      ...gridOptions.value,
      ...partial,
    };
    if (!isNil(gridApi.value)) {
      gridApi.value.updateGridOptions(partial);
    }
  }

  function setOption<K extends ManagedGridOptionKey>(
    key: K,
    value: GridOptions<PlAgDataTableV2Row>[K],
  ): void {
    const updated = { ...gridOptions.value };
    updated[key] = value;
    gridOptions.value = updated;
    if (!isNil(gridApi.value)) {
      gridApi.value.setGridOption(key, value);
    }
  }

  return {
    gridApi,
    gridOptions,
    updateOptions,
    setOption,
  };
}
