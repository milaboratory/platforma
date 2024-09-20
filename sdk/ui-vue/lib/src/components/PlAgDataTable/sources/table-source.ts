import type { ColDef, GridApi, IDatasource, IGetRowsParams } from '@ag-grid-community/core';
import {
  type ValueType,
  type PValueInt,
  PValueIntNA,
  PValueLongNA,
  type PValueFloat,
  PValueFloatNA,
  type PValueDouble,
  PValueDoubleNA,
  type PValueString,
  PValueStringNA,
  type PValueBytes,
  PValueBytesNA,
  type PFrameDriver,
  type PTableColumnId,
  type PTableColumnSpec,
  type PTableHandle,
  type PTableVector,
} from '@milaboratory/sdk-ui';
import * as lodash from 'lodash';
import canonicalize from 'canonicalize';

/**
 * Generate unique colId based on the column spec and index. The id encodes `PTableColumnId`, needed further to pass it to the filters for pfDriver.
 */
function makeColId(columnIndex: number, spec: PTableColumnSpec) {
  return btoa(
    canonicalize({
      columnIndex: columnIndex,
      id: {
        type: spec.type,
        id: spec.id,
      },
    })!,
  );
}

/**
 * Extract `PTableColumnId` from colId string
 */
export function parseColId(str: string) {
  return JSON.parse(atob(str)) as { columnIndex: number; id: PTableColumnId };
}

/**
 * Calculates column definition for a given p-table column
 */
function getColDef(columnIndex: number, spec: PTableColumnSpec): ColDef {
  return {
    colId: makeColId(columnIndex, spec),
    field: columnIndex.toString(),
    headerName: spec.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + spec.type + ' ' + columnIndex.toString(),
    lockPosition: spec.type === 'axis',
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
    cellDataType: ((valueType: ValueType) => {
      switch (valueType) {
        case 'Int':
        case 'Long':
        case 'Float':
        case 'Double':
          return 'number';
        case 'String':
        case 'Bytes':
          return 'text';
        default:
          throw Error(`unsupported data type: ${valueType satisfies never}`);
      }
    })(spec.type === 'axis' ? spec.spec.type : spec.spec.valueType),
  };
}

/**
 * Check if value is NA
 */
function isValueNA(value: unknown, valueType: ValueType): boolean {
  switch (valueType) {
    case 'Int':
      return (value as PValueInt) === PValueIntNA;
    case 'Long':
      return (value as bigint) === PValueLongNA;
    case 'Float':
      return (value as PValueFloat) === PValueFloatNA;
    case 'Double':
      return (value as PValueDouble) === PValueDoubleNA;
    case 'String':
      return (value as PValueString) === PValueStringNA;
    case 'Bytes':
      return (value as PValueBytes) === PValueBytesNA;
    default:
      throw Error(`unsupported data type: ${valueType satisfies never}`);
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

    const index = [];
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
        index.push(columns[columnIndex].type === 'Long' ? Number(value) : value);
      }
    }

    // generate ID based on the axes information
    row['id'] = JSON.stringify(index);

    rowData.push(row);
  }

  return rowData;
}

/**
 * Calculate GridOptions for p-table data source type
 */
export async function updatePFrameGridOptions(
  gridApi: GridApi,
  pfDriver: PFrameDriver,
  pt: PTableHandle,
): Promise<{
  columnDefs: ColDef[];
  datasource: IDatasource;
}> {
  const specs = await pfDriver.getSpec(pt);
  const columnDefs = specs.map((spec, i) => getColDef(i, spec));

  const ptShape = await pfDriver.getShape(pt);
  const rowCount = ptShape.rows;

  let lastParams: IGetRowsParams | undefined = undefined;
  const datasource = {
    rowCount,
    getRows: async (params) => {
      gridApi.setGridOption('loading', true);
      try {
        if (rowCount == 0) {
          params.successCallback([], rowCount);
          gridApi.setGridOption('loading', false);
          gridApi.showNoRowsOverlay();
          return;
        }

        // this is to avoid double flickering when underlying table is changed
        if (lastParams && (!lodash.isEqual(lastParams.sortModel, params.sortModel) || !lodash.isEqual(lastParams.filterModel, params.filterModel))) {
          lastParams = undefined;
          params.failCallback();
          return;
        }
        lastParams = params;

        const length = params.endRow - params.startRow;
        const data = await pfDriver.getData(pt, [...specs.keys()], {
          offset: params.startRow,
          length,
        });
        const rowData = columns2rows(specs, data, length);

        params.successCallback(rowData, ptShape.rows);
        gridApi.setGridOption('loading', false);
        gridApi.autoSizeAllColumns();
      } catch (error: unknown) {
        params.failCallback();
      }
    },
  } satisfies IDatasource;

  return {
    columnDefs,
    datasource,
  };
}
