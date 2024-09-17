import type { ColDef, GetRowIdParams, GridApi, GridOptions, IDatasource, IGetRowsParams } from '@ag-grid-community/core';
import {
  type PValueBytes,
  PValueBytesNA,
  type PValueDouble,
  PValueDoubleNA,
  type PValueFloat,
  PValueFloatNA,
  PValueIntNA,
  PValueLongNA,
  type PValueString,
  PValueStringNA,
  type PFrameDriver,
  type PTableColumnId,
  type PTableColumnSpec,
  type PTableHandle,
  type PTableVector,
  type PValueInt,
  type ValueType,
} from '@milaboratory/sdk-ui';
import * as lodash from 'lodash';
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
    headerName: spec.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + spec.type + ' ' + columnIndex.toString(),
    cellDataType: 'text',
    valueFormatter: (value) => {
      if (!value) {
        return 'ERROR';
      } else if (value.value === null) {
        return 'NULL';
      } else if (value.value === undefined) {
        return 'NA';
      } else {
        return value.value.toString();
      }
    },
  };

  if (spec.type == 'axis') {
    colDef.lockPosition = true;
  }

  let dataType: ValueType;
  if (spec.type == 'axis') {
    dataType = spec.spec.type;
  } else {
    dataType = spec.spec.valueType;
  }
  if (dataType == 'Int' || dataType == 'Long' || dataType == 'Double' || dataType == 'Float') {
    colDef.cellDataType = 'number';
  }

  return colDef;
}

/**
 * Check if value is NA
 */
function isValueNA(value: unknown, type: ValueType): boolean {
  if (type == 'Int') {
    return (value as PValueInt) === PValueIntNA;
  } else if (type == 'Long') {
    return (value as bigint) === PValueLongNA;
  } else if (type == 'Float') {
    return (value as PValueFloat) === PValueFloatNA;
  } else if (type == 'Double') {
    return (value as PValueDouble) === PValueDoubleNA;
  } else if (type == 'String') {
    return (value as PValueString) === PValueStringNA;
  } else if (type == 'Bytes') {
    return (value as PValueBytes) === PValueBytesNA;
  } else {
    throw Error('Unsupported value type: ' + type);
  }
}

/**
 * Check if value is absent
 */
function isValueAbsent(array: Uint8Array, index: number): boolean {
  const chunkIndex = Math.floor(index / 8);
  const mask = 1 << (7 - (index % 8));
  return (array[chunkIndex] & mask) > 0;
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
      if (isValueAbsent(columns[columnIndex].absent, iRow)) {
        row[field] = null; // NULL
      } else if (isValueNA(value, columns[columnIndex].type)) {
        row[field] = undefined; // NA
      } else {
        row[field] = columns[columnIndex].type === 'Long' ? Number(value) : value;
      }

      if (specs[columnIndex].type === 'axis') {
        axes.push(value);
      }
    }

    // generate ID based on the axes information
    row['id'] = JSON.stringify(axes, (_, v) => (typeof v === 'bigint' ? Number(v) : v));

    rowData.push(row);
  }

  return rowData;
}

/**
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
          !lodash.isEqual(lastParams.sortModel, params.sortModel)
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
