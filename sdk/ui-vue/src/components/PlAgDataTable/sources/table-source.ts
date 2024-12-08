import type { ColDef, IServerSideDatasource, IServerSideGetRowsParams, RowModelType } from '@ag-grid-community/core';
import type { PlDataTableSheet } from '@platforma-sdk/model';
import {
  type PColumnSpec,
  type PFrameDriver,
  type PTableColumnSpec,
  type PTableHandle,
  type PTableVector,
  type PValue,
  type ValueType,
  getAxisId,
  isValueAbsent,
  isValueNA,
} from '@platforma-sdk/model';
import canonicalize from 'canonicalize';
import * as lodash from 'lodash';
import { getHeterogeneousColumns, updatePFrameGridOptionsHeterogeneousAxes } from './table-source-heterogeneous';
import type { PlAgDataTableRow } from '../types';
import { makeRowNumberColDef, PlAgDataTableRowNumberColId } from './row-number';
import { PlAgColumnHeader, type PlAgHeaderComponentType, type PlAgHeaderComponentParams } from '../../PlAgColumnHeader';

/**
 * Generate unique colId based on the column spec.
 */
function makeColId(spec: PTableColumnSpec) {
  return canonicalize(spec)!;
}

/**
 * Extract `PTableColumnId` from colId string
 */
export function parseColId(str: string) {
  return JSON.parse(str) as PTableColumnSpec;
}

// do not use `any` please
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultValueFormatter = (value: any) => {
  if (!value) {
    return 'ERROR';
  } else if (value.value === undefined) {
    return 'NULL';
  } else if (value.value === null) {
    return 'NA';
  } else {
    return value.value.toString();
  }
};

/**
 * Calculates column definition for a given p-table column
 */
function getColDef(iCol: number, spec: PTableColumnSpec, hiddenColIds?: string[]): ColDef {
  const colId = makeColId(spec);
  const valueType = spec.type === 'axis' ? spec.spec.type : spec.spec.valueType;
  return {
    colId,
    field: iCol.toString(),
    headerName: spec.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + spec.type + ' ' + iCol.toString(),
    lockPosition: spec.type === 'axis',
    hide: hiddenColIds?.includes(colId) ?? spec.spec.annotations?.['pl7.app/table/visibility'] === 'optional',
    valueFormatter: defaultValueFormatter,
    headerComponent: PlAgColumnHeader,
    headerComponentParams: {
      type: ((): PlAgHeaderComponentType => {
        switch (valueType) {
          case 'Int':
          case 'Long':
          case 'Float':
          case 'Double':
            return 'Number';
          case 'String':
          case 'Bytes':
            return 'Text';
          default:
            throw Error(`unsupported data type: ${valueType satisfies never}`);
        }
      })(),
    } satisfies PlAgHeaderComponentParams,
    cellDataType: (() => {
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
    })(),
  };
}

/**
 * Convert value to displayable form
 */
function toDisplayValue(value: Exclude<PValue, null>, valueType: ValueType): string | number {
  switch (valueType) {
    case 'Int':
      return value as number;
    case 'Long':
      return typeof value === 'bigint' ? Number(value as bigint) : (value as number);
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
function columns2rows(fields: number[], columns: PTableVector[], axes: number[], index: number): PlAgDataTableRow[] {
  const nCols = fields.length;
  const rowData: PlAgDataTableRow[] = [];
  for (let iRow = 0; iRow < columns[0].data.length; ++iRow) {
    const key: unknown[] = [];
    const id = (index++).toString();
    for (const axisIdx of axes) key.push(columns[axisIdx].data[iRow]);
    const row: PlAgDataTableRow = { key, id };
    for (let iCol = 0; iCol < nCols; ++iCol) {
      const field = fields[iCol].toString() as `${number}`;
      const value = columns[iCol].data[iRow];
      const valueType = columns[iCol].type;
      if (isValueAbsent(columns[iCol].absent, iRow)) {
        row[field] = undefined; // NULL
      } else if (isValueNA(value, valueType) || value === null) {
        row[field] = null; // NA
      } else {
        row[field] = toDisplayValue(value, valueType);
      }
    }

    rowData.push(row);
  }
  return rowData;
}

const isLabelColumn = (col: PTableColumnSpec) => col.type === 'column' && col.spec.axesSpec.length === 1 && col.spec.name === 'pl7.app/label';

/**
 * Calculate GridOptions for p-table data source type
 */
export async function updatePFrameGridOptions(
  pfDriver: PFrameDriver,
  pt: PTableHandle,
  sheets: PlDataTableSheet[],
  hiddenColIds?: string[],
): Promise<{
    columnDefs: ColDef[];
    serverSideDatasource?: IServerSideDatasource;
    rowModelType: RowModelType;
    rowData?: unknown[];
  }> {
  const specs = await pfDriver.getSpec(pt);

  let numberOfAxes = specs.findIndex((s) => s.type === 'column');
  if (numberOfAxes === -1) numberOfAxes = specs.length;

  // column indices in the specs array that we are going to process
  const indices = [...specs.keys()]
    .filter(
      (i) =>
        !lodash.some(
          sheets,
          (sheet) =>
            lodash.isEqual(getAxisId(sheet.axis), specs[i].id)
            || (specs[i].type === 'column'
              && specs[i].spec.name === 'pl7.app/label'
              && specs[i].spec.axesSpec.length === 1
              && lodash.isEqual(getAxisId(sheet.axis), getAxisId(specs[i].spec.axesSpec[0]))),
        ),
    )
    .sort((a, b) => {
      if (specs[a].type !== specs[b].type) return specs[a].type === 'axis' ? -1 : 1;

      const aPriority = specs[a].spec.annotations?.['pl7.app/table/orderPriority'];
      const bPriority = specs[b].spec.annotations?.['pl7.app/table/orderPriority'];

      if (aPriority === undefined) return bPriority === undefined ? 0 : 1;
      if (bPriority === undefined) return -1;
      return Number(bPriority) - Number(aPriority);
    });

  const fields = lodash.cloneDeep(indices);

  // get columns with heterogeneous axes
  const hColumns = getHeterogeneousColumns(specs, indices);

  // process label columns
  for (let i = indices.length - 1; i >= 0; --i) {
    const idx = indices[i];
    if (!isLabelColumn(specs[idx])) continue;

    // axis of labels
    const axisId = getAxisId((specs[idx].spec as PColumnSpec).axesSpec[0]);
    const axisIdx = lodash.findIndex(indices, (idx) => lodash.isEqual(specs[idx].id, axisId));
    if (axisIdx === -1) {
      // no axis, probably we are in the sheet
      const sheetIdx = lodash.findIndex(sheets, (sheet) => lodash.isEqual(getAxisId(sheet.axis), axisId));
      if (sheetIdx === -1) {
        console.warn(`added label column, but the axis is not in the data; axisId: ${axisId}`);
        continue;
      }
    }

    // replace in h-columns
    indices[axisIdx] = idx;
    for (const hCol of hColumns) {
      if (hCol.axisIdx === idx) {
        hCol.axisIdx = axisIdx;
      }
    }

    // remove original axis
    indices.splice(i, 1);
    fields.splice(i, 1);
  }

  const ptShape = await pfDriver.getShape(pt);
  const rowCount = ptShape.rows;
  const columnDefs: ColDef<PlAgDataTableRow>[] = [makeRowNumberColDef(), ...fields.map((i) => getColDef(i, specs[i], hiddenColIds))];

  if (hColumns.length > 1) {
    console.warn('Currently, only one heterogeneous axis is supported in the table, got', hColumns.length, ' transposition will not be applied.');
  }

  if (hColumns.length === 1) {
    // return data
    return updatePFrameGridOptionsHeterogeneousAxes(hColumns, ptShape, columnDefs, await pfDriver.getData(pt, indices), fields, indices);
  }

  // mixing in axis indices

  const allIndices = [...indices];

  // axisIdx (0..<axesCount) -> idx in allIndices array
  const axisToFieldIdx = new Map<number, number>();
  for (let i = 0; i < numberOfAxes; ++i) axisToFieldIdx.set(i, -1);

  for (let i = 0; i < allIndices.length; ++i) {
    const idx = allIndices[i];
    if (axisToFieldIdx.has(idx)) axisToFieldIdx.set(idx, i);
  }

  // at this point we have axis indices that are not listed in indices set to -1 in axisToFieldIdx

  // adding those indices at the end of allIndices array, to make sure we have all the axes in our response
  for (const [key, value] of axisToFieldIdx)
    if (value === -1) {
      axisToFieldIdx.set(key, allIndices.length /* at this index value will be inserted in the next line */);
      allIndices.push(key);
    }

  // indices of axes in allIndices array
  const axes: number[] = [];
  for (let i = 0; i < numberOfAxes; ++i) {
    const fieldIdx = axisToFieldIdx.get(i);
    if (fieldIdx === undefined || fieldIdx === -1) throw new Error('assertion exception');
    axes.push(fieldIdx);
  }

  let lastParams: IServerSideGetRowsParams | undefined = undefined;
  const serverSideDatasource = {
    getRows: async (params: IServerSideGetRowsParams) => {
      try {
        if (rowCount == 0) {
          params.success({ rowData: [], rowCount });
          params.api.setGridOption('loading', false);
          params.api.showNoRowsOverlay();
          return;
        }

        // this is to avoid double flickering when underlying table is changed
        if (lastParams && !lodash.isEqual(lastParams.request.sortModel, params.request.sortModel)) {
          lastParams = undefined;
          params.api.setGridOption('loading', true);
          params.success({ rowData: [], rowCount: 0 });
          return;
        }
        lastParams = params;

        let length = 0;
        let rowData: unknown[] = [];
        if (rowCount > 0 && params.request.startRow !== undefined && params.request.endRow !== undefined) {
          length = Math.min(rowCount, params.request.endRow) - params.request.startRow;
          if (length > 0) {
            const data = await pfDriver.getData(pt, allIndices, {
              offset: params.request.startRow,
              length,
            });
            rowData = columns2rows(fields, data, axes, params.request.startRow);
          }
        }

        params.success({ rowData, rowCount });
        params.api.autoSizeColumns(params.api.getAllDisplayedColumns().filter((column) => column.getColId() !== PlAgDataTableRowNumberColId));
        params.api.setGridOption('loading', false);
      } catch (error: unknown) {
        params.api.setGridOption('loading', true);
        params.fail();
        console.trace(error);
      }
    },
  } satisfies IServerSideDatasource;

  return {
    rowModelType: 'serverSide',
    columnDefs,
    serverSideDatasource,
  };
}
