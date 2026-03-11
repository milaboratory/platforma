import { isJsonEqual } from "@milaboratories/helpers";
import { parseJson, PlSelectionModel } from "@platforma-sdk/model";
import {
  CellRendererSelectorFunc,
  GridApi,
  GridOptions,
  ManagedGridOptionKey,
  ManagedGridOptions,
} from "ag-grid-enterprise";
import { shallowRef } from "vue";
import { autoSizeRowNumberColumn } from "../sources/row-number";
import {
  PlAgDataTableV2Row,
  PlTableRowIdJson,
  PlAgOverlayLoadingParams,
  PlAgOverlayNoRowsParams,
} from "../types";
import PlOverlayLoading from "../PlAgOverlayLoading.vue";
import PlOverlayNoRows from "../PlAgOverlayNoRows.vue";
import { isNil } from "es-toolkit";

export function useGrid({
  selection,
  noRowsText,
  loadingText,
  runningText,
  notReadyText,
  cellRendererSelector,
}: {
  selection?: PlSelectionModel;
  noRowsText?: string;
  loadingText?: string;
  runningText?: string;
  notReadyText?: string;
  cellRendererSelector?: CellRendererSelectorFunc<PlAgDataTableV2Row>;
}) {
  const gridApi = shallowRef<GridApi<PlAgDataTableV2Row> | null>(null);
  const gridOptions = shallowRef<GridOptions<PlAgDataTableV2Row>>({
    animateRows: false,
    suppressColumnMoveAnimation: true,
    cellSelection: isNil(selection),
    autoSizeStrategy: { type: "fitCellContents" },
    rowSelection: selection
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
      cellRendererSelector,
    },
    maintainColumnOrder: true,
    localeText: {
      loadingError: "...",
    },
    rowModelType: "serverSide",
    // cacheBlockSize should be the same as PlMultiSequenceAlignment limit
    // so that selectAll will add all rows to selection
    cacheBlockSize: 1000,
    maxBlocksInCache: 100,
    blockLoadDebounceMillis: 500,
    serverSideSortAllLevels: true,
    suppressServerSideFullWidthLoadingRow: true,
    getRowId: (params) => params.data.id,
    loading: true,
    loadingOverlayComponentParams: {
      variant: "not-ready",
      loadingText: loadingText,
      runningText: runningText,
      notReadyText: notReadyText,
    } satisfies PlAgOverlayLoadingParams,
    loadingOverlayComponent: PlOverlayLoading,
    noRowsOverlayComponent: PlOverlayNoRows,
    noRowsOverlayComponentParams: {
      text: noRowsText,
    } satisfies PlAgOverlayNoRowsParams,
    defaultCsvExportParams: {
      allColumns: true,
      suppressQuotes: true,
      columnSeparator: "\t",
      fileName: "table.tsv",
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
            case "setGridOption":
              return setGridOption;
            case "updateGridOptions":
              return updateGridOptions;
            default:
              return Reflect.get(target, prop, receiver);
          }
        },
      });
    },
    onSelectionChanged: (event) => {
      if (!isNil(selection)) {
        const state = event.api.getServerSideSelectionState();
        const selectedKeys =
          state?.toggledNodes?.map((nodeId) => parseJson(nodeId as PlTableRowIdJson)) ?? [];
        if (!isJsonEqual(selection.selectedKeys, selectedKeys)) {
          selection = { ...selection, selectedKeys };
        }
      }
    },
    onRowDoubleClicked: (_event) => {
      throw new Error("not overrided onRowDoubleClicked");
    },
    onStateUpdated: (_event) => {
      throw new Error("not overrided onStateUpdated");
    },
    onGridPreDestroyed: (_event) => {
      throw new Error("not overrided onGridPreDestroyed");
    },
  });

  return { gridApi, gridOptions };
}
