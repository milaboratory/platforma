import type { ColDef, IDatasource, RowModelType } from '@ag-grid-community/core';
import type { AxisSpec, PColumnSpec, PTableColumnSpec, PTableShape, PTableVector, PVectorDataString } from '@platforma-sdk/model';
import { getAxisId } from '@platforma-sdk/model';
import canonicalize from 'canonicalize';
import * as lodash from 'lodash';
import { defaultValueFormatter } from './table-source';

type HeterogeneousColumnInfo = {
  /**
   * Index of the column with heterogeneous axis in the p-table array
   */
  columnIdx: number;
  /**
   * Index of the corresponding heterogeneous axis in the p-table array
   */
  axisIdx: number;
};

function getHeterogeneousAxes(spec: PColumnSpec): AxisSpec[] {
  return spec.axesSpec.filter((axSpec) => axSpec.annotations?.['pl7.app/axisNature'] === 'heterogeneous');
}

/**
 * Returns a list of columns containing heterogeneous axis (if a column contains multiple, all will be returned)
 * @param specs p-table column specs
 * @param indices indices of columns of interest in the spec array
 * @returns list of columns
 */
export function getHeterogeneousColumns(specs: PTableColumnSpec[], indices: number[]): HeterogeneousColumnInfo[] {
  const cols: HeterogeneousColumnInfo[] = [];

  // check we have heterogeneous axis, which we need to transpose
  for (const i of indices) {
    if (specs[i].type === 'column') {
      const hAxes = getHeterogeneousAxes(specs[i].spec);

      for (const hAx of hAxes) {
        if (hAx.type !== 'String') {
          console.warn('heterogeneous axis with string type expected, got', hAx, 'skipping');
          continue;
        }

        const axisId = getAxisId(hAx);
        const axisIdx = specs.findIndex((s) => lodash.isEqual(s.id, axisId));

        if (axisIdx === -1) {
          console.error('axis not found', i, axisId, specs);
          throw Error('axis not found');
        }

        cols.push({ columnIdx: i, axisIdx: axisIdx });
      }
    }
  }

  return cols;
}

// auxiliary function to get a field for i-th axis-value
const hColumnField = (originalLength: number, i: number) => (originalLength + i).toString();

/**
 * Calculate GridOptions for p-table data source type
 *
 * @param hColumns heterogeneous columns list
 * @param shape table shape
 * @param columnDefs initial column definitions (with h-cols inside and no additional columns)
 * @param data data array (including initial columns)
 * @param fields fields corresponding to initial column defs
 * @param indices indices in the original specs array
 */
export function updatePFrameGridOptionsHeterogeneousAxes(
  hColumns: HeterogeneousColumnInfo[],
  shape: PTableShape,
  columnDefs: ColDef[],
  data: PTableVector[],
  fields: number[],
  indices: number[],
): {
  columnDefs: ColDef[];
  datasource?: IDatasource;
  rowModelType: RowModelType;
  rowData?: unknown[];
} {
  if (hColumns.length > 1) {
    throw Error('hColumns.length > 1 is not supported');
  }

  const hColumn = hColumns[0];

  // recalculate indices of h-cols to the positions in the resulting data
  // index of axis & column in indices array
  let axisIdx: number = -1;
  let columnIdx: number = -1;
  for (let i = 0; i < indices.length; ++i) {
    if (indices[i] === hColumn.axisIdx) {
      axisIdx = i;
    }
    if (indices[i] === hColumn.columnIdx) {
      columnIdx = i;
    }
  }

  // columns to add into the data table definition
  const hAxisValues: string[] = (() => {
    // only string data is supported
    const allValues = data[axisIdx].data as PVectorDataString;
    const notNull = allValues.filter((v) => v !== null);
    return Array.from(new Set(notNull));
  })();

  // sort for canonicalization
  hAxisValues.sort();

  // remove heterogeneous column from the column defs
  if (columnIdx > axisIdx) {
    columnDefs.splice(columnIdx, 1);
    columnDefs.splice(axisIdx, 1);
  } else {
    columnDefs.splice(axisIdx, 1);
    columnDefs.splice(columnIdx, 1);
  }

  // calculate row data
  const rowData = calculateRowData(fields, data, axisIdx, columnIdx, hAxisValues, shape.rows);

  // add additional column definitions
  for (let i = 0; i < hAxisValues.length; ++i) {
    const header = hAxisValues[i];
    const id = header + '@' + i; // at least add i to avoid name clash with other columns

    columnDefs.push({
      colId: id,
      field: hColumnField(data.length, i),
      headerName: header,
      valueFormatter: defaultValueFormatter,
    });
  }

  return {
    rowModelType: 'clientSide',
    columnDefs,
    rowData,
  };
}

/** calculate row data for the table with heterogeneous axis */
function calculateRowData(
  fields: number[],
  data: PTableVector[],
  axisIdx: number,
  columnIdx: number,
  hAxisValues: string[],
  nRows: number,
): unknown[] {
  // do not use `any` please
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uniqueRowsMap: Map<string, Record<string, any>> = new Map();

  // transposed iRow
  let iRowT = 0;
  for (let iRow = 0; iRow < nRows; iRow++) {
    // do not use `any` please
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rowPart: Record<string, any> = {};

    for (let iCol = 0; iCol < data.length; ++iCol) {
      if (iCol === axisIdx || iCol === columnIdx) continue;
      const field = fields[iCol].toString();
      rowPart[field] = data[iCol].data[iRow];
    }

    // do not use `any` please
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let row: Record<string, any>;
    const id = canonicalize(Object.values(rowPart)) ?? '';
    if (!uniqueRowsMap.has(id)) {
      uniqueRowsMap.set(id, rowPart);
      row = rowPart;
      row['id'] = iRowT.toString();
      iRowT++;
    } else {
      row = uniqueRowsMap.get(id)!;
    }

    const idx = hAxisValues.indexOf(data[axisIdx].data[iRow] as string);
    if (idx === -1) {
      throw Error('index not found');
    }

    const field = hColumnField(data.length, idx);
    row[field] = data[columnIdx].data[iRow];
  }

  const result = Array.from(uniqueRowsMap.values());

  return result;
}
