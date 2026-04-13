import type { AgGridEvent, AgPublicEventType } from "ag-grid-enterprise";
import { isColumnSelectionCol, type GridApi } from "ag-grid-enterprise";
import type { Ref, ShallowRef } from "vue";
import { nextTick } from "vue";
import type { PlAgDataTableV2Row } from "../../PlAgDataTable/types";
import { ROW_NUMBER_COL_ID, ROW_NUMBER_HEADER_SIZE, WIDEST_DIGIT } from "../constants";

type UseRowNumberColumnParameters = {
  gridApi: ShallowRef<GridApi<PlAgDataTableV2Row> | null>;
  measureElement: Ref<HTMLSpanElement | null>;
};

type UseRowNumberColumnReturn = {
  /** Call this when gridApi becomes available (after onGridReady) to set up event listeners */
  setupListeners: (api: GridApi<PlAgDataTableV2Row>) => void;
};

function adjustRowNumberColumnWidth(
  api: GridApi<PlAgDataTableV2Row>,
  measureElement: HTMLSpanElement,
  force?: boolean,
): void {
  const rowNode = api.getDisplayedRowAtIndex(api.getLastDisplayedRowIndex());
  if (rowNode === undefined || rowNode === null) return;

  const lastDisplayedRowNumber = api.getCellValue({
    rowNode,
    colKey: ROW_NUMBER_COL_ID,
  });

  if (typeof lastDisplayedRowNumber !== "number") return;

  const lastDisplayedRowNumberDigitCount = lastDisplayedRowNumber.toString().length;
  if (force !== true && measureElement.innerHTML.length === lastDisplayedRowNumberDigitCount)
    return;

  measureElement.innerHTML = WIDEST_DIGIT.repeat(lastDisplayedRowNumberDigitCount);

  nextTick(() => {
    api.applyColumnState({
      state: [
        {
          colId: ROW_NUMBER_COL_ID,
          pinned: "left",
          width: Math.max(ROW_NUMBER_HEADER_SIZE, measureElement.offsetWidth),
        },
      ],
    });
  });
}

function fixColumnOrder(api: GridApi<PlAgDataTableV2Row>): void {
  if (api.isDestroyed()) return;

  const columns = api.getAllGridColumns() ?? [];
  const selectionIndex = columns.findIndex(isColumnSelectionCol);
  const numRowsIndex = columns.findIndex((column) => column.getId() === ROW_NUMBER_COL_ID);

  if (numRowsIndex !== -1) {
    if (selectionIndex !== -1) {
      if (selectionIndex !== 0 || numRowsIndex !== 1) {
        gridMoveColumns(api, [columns[numRowsIndex], columns[selectionIndex]], 0);
      }
    } else {
      if (numRowsIndex !== 0) {
        gridMoveColumns(api, [columns[numRowsIndex]], 0);
      }
    }
  }
}

function gridMoveColumns(
  api: GridApi<PlAgDataTableV2Row>,
  columnsToMove: Parameters<GridApi["moveColumns"]>[0],
  toIndex: number,
): void {
  api.moveColumns(columnsToMove, toIndex);
}

export function useRowNumberColumn(params: UseRowNumberColumnParameters): UseRowNumberColumnReturn {
  const { measureElement } = params;

  const setupListeners = (api: GridApi<PlAgDataTableV2Row>): void => {
    const adjust = (): void => {
      if (measureElement.value === null) return;
      adjustRowNumberColumnWidth(api, measureElement.value);
    };

    const adjustForced = (): void => {
      if (measureElement.value === null) return;
      adjustRowNumberColumnWidth(api, measureElement.value, true);
    };

    api.addEventListener("firstDataRendered", () => {
      adjust();
    });

    api.addEventListener("viewportChanged", () => {
      adjust();
    });

    api.addEventListener("columnVisible", (event) => {
      if (
        event.columns !== null &&
        event.columns !== undefined &&
        event.columns.some(
          (column) => column.isVisible() && column.getColId() === ROW_NUMBER_COL_ID,
        )
      ) {
        adjust();
      }
    });

    api.addEventListener("columnResized", (event) => {
      if (
        event.finished === true &&
        event.source === "autosizeColumns" &&
        event.columns !== null &&
        event.columns !== undefined &&
        event.columns.some(
          (column) => column.isVisible() && column.getColId() === ROW_NUMBER_COL_ID,
        )
      ) {
        adjustForced();
      }
    });

    const refreshCells = (event: AgGridEvent): void => {
      event.api.refreshCells();
    };
    const refreshCellsOn: AgPublicEventType[] = ["sortChanged", "filterChanged", "modelUpdated"];
    refreshCellsOn.forEach((eventType) => api.addEventListener(eventType, refreshCells));

    api.addEventListener("displayedColumnsChanged", (event) => {
      fixColumnOrder(event.api);
    });

    adjust();
    fixColumnOrder(api);
  };

  return {
    setupListeners,
  };
}
