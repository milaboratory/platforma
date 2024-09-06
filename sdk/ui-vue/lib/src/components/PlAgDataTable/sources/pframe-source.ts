import type { ColDef, GetRowIdParams, GridApi, GridOptions, IDatasource, IGetRowsParams, SortModelItem } from '@ag-grid-community/core';
import type { PFrameDriver, PTableColumnId, PTableColumnSpec, PTableHandle, PTableVector, ValueType } from '@milaboratory/sdk-ui';

import canonicalize from 'canonicalize';

/**
 * Generate unique colId based on the column spec and index. The id encodes `PTableColumnId`, needed further to pass it to the filters for pfDriver.
 */
const colIdFunc = (columnIndex: number, spec: PTableColumnSpec) => {
  return btoa(
    canonicalize({
      columnIndex: columnIndex,
      id: {
        type: spec.type,
        id: spec.id,
      },
    })!,
  );
};
/**
 * Extract `PTableColumnId` from colId string
 */
export const parseColId = (str: string) => JSON.parse(atob(str)) as { columnIndex: number; id: PTableColumnId };

/**
 * Calculates column definition for a given p-table column
 */
function getColDef(columnIndex: number, spec: PTableColumnSpec): ColDef {
  const id = colIdFunc(columnIndex, spec);
  const field = columnIndex.toString();
  const colDef: ColDef = {
    colId: id,
    field: field,
    headerName: spec.spec.annotations?.['pl7.app/label'] ?? '',
    cellDataType: true,
  };

  // pin column if it is a 'key colum'
  if (spec.type == 'axis') {
    colDef.pinned = 'left';
    colDef.lockPosition = true;
  }

  let dataType: ValueType;
  if (spec.type == 'axis') {
    dataType = spec.spec.type;
  } else {
    dataType = spec.spec.valueType;
  }
  if (dataType == 'Int' || dataType == 'Long' || dataType == 'Double' || dataType == 'Float') {
    colDef.type = 'numericColumn';
  }

  return colDef;
}

/**
 * Convert columnar data from the driver to rows, used by ag-grid
 * @param specs column specs
 * @param columns columnar data
 * @param nRows number of rows
 * @returns
 */
function columns2rows(specs: PTableColumnSpec[], columns: PTableVector[], nRows: number): unknown[] {
  const nCols = columns.length;
  const rowData = [];
  for (let iRow = 0; iRow < nRows; ++iRow) {
    const row: Record<string, unknown> = {};

    const axes = [];
    for (let columnIndex = 0; columnIndex < nCols; ++columnIndex) {
      const field = columnIndex.toString();
      const value = columns[columnIndex].data[iRow];
      row[field] = value;

      if (specs[columnIndex].type === 'axis') {
        axes.push(value);
      }
    }

    // generate ID based on the axes information
    row['id'] = JSON.stringify(axes, (_, v) => (typeof v === 'bigint' ? v.toString() : v));

    rowData.push(row);
  }

  return rowData;
}

/**
 * Check whether the sorting is changed.
 */
const sortChanged = (oldSort: SortModelItem[] | undefined, newSort: SortModelItem[] | undefined) => {
  if (oldSort && !newSort) return true;
  else if (!oldSort && newSort) return true;
  else if (!oldSort && !newSort) return false;
  else if (oldSort?.length != newSort?.length) return true;
  else if (oldSort && newSort) {
    for (let i = 0; i < oldSort.length; ++i) {
      if (oldSort[i].colId !== newSort[i].colId) return true;
      if (oldSort[i].sort !== newSort[i].sort) return true;
    }

    return false;
  } else return false;
};

/**
 *
 * Calculate GridOptions for p-table data source type
 */
export async function pFrameGridOptions(pfDriver: PFrameDriver, pt: PTableHandle, gridApi: GridApi | undefined): Promise<GridOptions> {
  const specs = await pfDriver.getSpec(pt);
  const ptShape = await pfDriver.getShape(pt);

  // indices of columns to take; for now taking all of them
  const indices: number[] = [];
  for (let i = 0; i < specs.length; ++i) {
    indices.push(i);
  }

  let lastParams: IGetRowsParams | undefined = undefined;

  const datasource: IDatasource = {
    rowCount: ptShape.rows,
    getRows: async (params: IGetRowsParams) => {
      try {
        if (ptShape.rows == 0) {
          // we have to call for the 'showNoRowsOverlay'  explicitly as ag-grid doesn't do this for infinite datasource model
          gridApi?.setGridOption('loading', false);
          gridApi?.showNoRowsOverlay();
          return;
        }

        if (
          lastParams &&
          lastParams.startRow === params.startRow &&
          lastParams.endRow === params.endRow &&
          sortChanged(lastParams.sortModel, params.sortModel)
        ) {
          // this is to avoid double flickering when sort is changed:
          // as we do sort by re-creating the p-table with the driver,
          // we can't set any data yet, so we force loading overlay and
          // fail here, as we don't have the data yet.
          lastParams = undefined;
          gridApi?.setGridOption('loading', true);
          params.failCallback();
        } else {
          const length = params.endRow - params.startRow;
          const data = await pfDriver.getData(pt, indices, {
            offset: params.startRow,
            length: params.endRow - params.startRow,
          });

          const rowData = columns2rows(specs, data, length);
          lastParams = params;

          gridApi?.setGridOption('loading', false);
          params.successCallback(rowData, ptShape.rows);
        }
      } catch (error: unknown) {
        params.failCallback();
      }
    },
  };

  const columnDefs = [];
  for (let columnIndex = 0; columnIndex < ptShape.columns; ++columnIndex) {
    columnDefs.push(getColDef(columnIndex, specs[columnIndex]));
  }

  const getRowId = (params: GetRowIdParams) => params.data.id;

  return {
    datasource,
    columnDefs,
    getRowId,
    maxBlocksInCache: 10000,
    cacheBlockSize: 100,
    rowModelType: 'infinite',
  };
}
