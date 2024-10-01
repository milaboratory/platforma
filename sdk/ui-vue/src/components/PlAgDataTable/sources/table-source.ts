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
  type PColumnSpec,
  getAxesId,
} from '@platforma-sdk/model';
import * as lodash from 'lodash';
import canonicalize from 'canonicalize';
import { type PlDataTableSheet } from '../types';

/**
 * Generate unique colId based on the column spec.
 */
function makeColId(spec: PTableColumnSpec) {
  return canonicalize({
    type: spec.type,
    id: spec.id,
  })!;
}

/**
 * Extract `PTableColumnId` from colId string
 */
export function parseColId(str: string) {
  return JSON.parse(str) as PTableColumnId;
}

/**
 * Calculates column definition for a given p-table column
 */
function getColDef(iCol: number, spec: PTableColumnSpec): ColDef {
  return {
    colId: makeColId(spec),
    field: iCol.toString(),
    headerName: spec.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + spec.type + ' ' + iCol.toString(),
    lockPosition: spec.type === 'axis',
    valueFormatter: (value) => {
      if (!value) {
        return 'ERROR';
      } else if (value.value === undefined) {
        return 'NULL';
      } else if (value.value === null) {
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
 * Convert value to displayable form
 */
function toDisplayValue(value: string | number | bigint | Uint8Array, valueType: ValueType): string | number {
  switch (valueType) {
    case 'Int':
      return value as number;
    case 'Long':
      return Number(value as bigint);
    case 'Float':
      return value as number;
    case 'Double':
      return value as number;
    case 'String':
      return value as string;
    case 'Bytes':
      return Buffer.from(value as Uint8Array).toString('hex');
    default:
      throw Error(`unsupported data type: ${valueType satisfies never}`);
  }
}

/**
 * Convert columnar data from the driver to rows, used by ag-grid
 * @param specs column specs
 * @param columns columnar data
 * @param nRows number of rows
 * @returns
 */
function columns2rows(fields: number[], columns: PTableVector[]): unknown[] {
  const nCols = columns.length;
  const rowData = [];
  for (let iRow = 0; iRow < columns[0].data.length; ++iRow) {
    const row: Record<string, unknown> = {};

    const index = [];
    for (let iCol = 0; iCol < nCols; ++iCol) {
      const field = fields[iCol].toString();
      const value = columns[iCol].data[iRow];
      const valueType = columns[iCol].type;
      if (isValueAbsent(columns[iCol].absent, iRow)) {
        row[field] = undefined; // NULL
      } else if (isValueNA(value, valueType) || value === null) {
        row[field] = null; // NA
      } else {
        row[field] = toDisplayValue(value, valueType);
      }

      index.push(valueType === 'Long' ? Number(value) : value);
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
  sheets: PlDataTableSheet[],
): Promise<{
  columnDefs: ColDef[];
  datasource: IDatasource;
}> {
  const specs = await pfDriver.getSpec(pt);
  const indices = specs
    .map((spec, i) => (!lodash.find(sheets, (sheet) => lodash.isEqual(sheet.axis, spec.id)) ? i : null))
    .filter((entry) => entry !== null);
  const fields = lodash.cloneDeep(indices);

  for (let i = indices.length - 1; i >= 0; --i) {
    const idx = indices[i];
    if (specs[idx].type !== 'column' || specs[idx].spec.name !== 'pl7.app/label') continue;

    let axisId = getAxesId((specs[idx].spec as PColumnSpec).axesSpec).map(lodash.cloneDeep)[0];
    let axisIdx = lodash.findIndex(indices, (idx) => lodash.isEqual(specs[idx].id, axisId));
    if (axisIdx === -1) continue;

    indices[axisIdx] = idx;
    indices.splice(idx, 1);
    fields.splice(idx, 1);
  }

  const columnDefs = fields.map((i) => getColDef(i, specs[i]));

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
        if (lastParams && !lodash.isEqual(lastParams.sortModel, params.sortModel)) {
          lastParams = undefined;
          params.failCallback();
          return;
        }
        lastParams = params;

        const length = params.endRow - params.startRow;
        let rowData: unknown[] = [];
        if (length > 0) {
          const data = await pfDriver.getData(pt, indices, {
            offset: params.startRow,
            length,
          });
          rowData = columns2rows(fields, data);
        }

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
