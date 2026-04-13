import type { PFrameDriver, PTableHandle } from "@platforma-sdk/model";
import type { GridApi, IServerSideDatasource, IServerSideGetRowsParams } from "ag-grid-enterprise";
import type { PlAgDataTableV2Row } from "../../PlAgDataTable/types";
import { PlAgDataTableRowNumberColId } from "../../PlAgDataTable/sources/row-number";
import { isJsonEqual } from "@milaboratories/helpers";
import { columnsToRows } from "./columnsToRows";

export type DatasourceBuilderOptions = {
  readonly pfDriver: PFrameDriver;
  readonly visibleTableHandle: PTableHandle;
  readonly fields: number[];
  readonly requestIndices: number[];
  readonly fieldResultMapping: number[];
  readonly axesResultIndices: number[];
  readonly signal: AbortSignal;
  readonly onDataRendered: (api: GridApi<PlAgDataTableV2Row>) => void;
};

/**
 * Builds an ag-grid IServerSideDatasource that fetches data from the PFrameDriver.
 * Uses AbortSignal for cancellation instead of generation counter.
 */
export function buildDatasource(
  options: DatasourceBuilderOptions,
): IServerSideDatasource<PlAgDataTableV2Row> {
  const {
    pfDriver,
    visibleTableHandle,
    fields,
    requestIndices,
    fieldResultMapping,
    axesResultIndices,
    signal,
    onDataRendered,
  } = options;

  let rowCount = -1;
  let lastParams: IServerSideGetRowsParams | undefined = undefined;

  return {
    getRows: async (params: IServerSideGetRowsParams) => {
      if (signal.aborted) return params.fail();

      try {
        if (rowCount === -1) {
          const ptShape = await pfDriver.getShape(visibleTableHandle);
          if (signal.aborted || params.api.isDestroyed()) return params.fail();
          rowCount = ptShape.rows;
        }

        if (rowCount === 0) {
          params.success({ rowData: [], rowCount });
          // AgGrid cannot show two overlays at once,
          // so first hide loading overlay, then show no rows overlay
          params.api.setGridOption("loading", false);
          params.api.showNoRowsOverlay();
          return;
        }

        // If sort has changed - show skeletons instead of data
        if (
          lastParams !== undefined &&
          !isJsonEqual(lastParams.request.sortModel, params.request.sortModel)
        ) {
          return params.success({ rowData: [], rowCount });
        }
        lastParams = params;

        let length = 0;
        let rowData: PlAgDataTableV2Row[] = [];
        if (
          rowCount > 0 &&
          params.request.startRow !== undefined &&
          params.request.endRow !== undefined
        ) {
          length = Math.min(rowCount, params.request.endRow) - params.request.startRow;
          if (length > 0) {
            const data = await pfDriver.getData(visibleTableHandle, requestIndices, {
              offset: params.request.startRow,
              length,
            });
            if (signal.aborted || params.api.isDestroyed()) return params.fail();
            rowData = columnsToRows(fields, data, fieldResultMapping, axesResultIndices);
          }
        }

        params.success({ rowData, rowCount });
        params.api.autoSizeColumns(
          params.api
            .getAllDisplayedColumns()
            .filter((column) => column.getColId() !== PlAgDataTableRowNumberColId),
        );
        params.api.setGridOption("loading", false);
        onDataRendered(params.api);
      } catch (error: unknown) {
        if (signal.aborted || params.api.isDestroyed()) return params.fail();
        params.api.setGridOption("loading", true);
        params.fail();
        console.trace(error);
      }
    },
  };
}
