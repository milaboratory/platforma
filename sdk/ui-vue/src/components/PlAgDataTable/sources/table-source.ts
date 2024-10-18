import type { ColDef, GridApi, IDatasource, IGetRowsParams, RowModelType } from '@ag-grid-community/core';
import type { AxisId, JoinEntry, PColumnIdAndSpec, PFrameHandle, PObjectId } from '@platforma-sdk/model';
import {
  type PColumnSpec,
  type PFrameDriver,
  type PTableColumnId,
  type PTableColumnSpec,
  type PTableHandle,
  type PTableVector,
  type PValue,
  type ValueType,
  getAxesId,
  isValueAbsent,
  isValueNA,
  mapJoinEntry,
} from '@platforma-sdk/model';
import canonicalize from 'canonicalize';
import * as lodash from 'lodash';
import { type PlDataTableSheet } from '../types';
import { getHeterogeneousColumns, updatePFrameGridOptionsHeterogeneousAxes } from './table-source-heterogeneous';

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
function getColDef(iCol: number, spec: PTableColumnSpec): ColDef {
  return {
    colId: makeColId(spec),
    field: iCol.toString(),
    headerName: spec.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + spec.type + ' ' + iCol.toString(),
    lockPosition: spec.type === 'axis',
    valueFormatter: defaultValueFormatter,
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

function getColumnsFromJoin(join: JoinEntry<PColumnIdAndSpec>): PColumnIdAndSpec[] {
  const columns: PColumnIdAndSpec[] = [];
  mapJoinEntry(join, (idAndSpec) => {
    columns.push(idAndSpec);
    return idAndSpec;
  });
  return columns;
}

async function getLabelColumns(pfDriver: PFrameDriver, pFrame: PFrameHandle, idsAndSpecs: PColumnIdAndSpec[]): Promise<PColumnIdAndSpec[]> {
  if (!idsAndSpecs.length) return [];

  const response = await pfDriver.findColumns(pFrame, {
    columnFilter: {
      name: ['pl7.app/label'],
    },
    compatibleWith: lodash.uniqWith(idsAndSpecs.map((column) => getAxesId(column.spec.axesSpec).map(lodash.cloneDeep)).flat(), lodash.isEqual),
    strictlyCompatible: true,
  });
  return response.hits.filter((idAndSpec) => idAndSpec.spec.axesSpec.length === 1);
}

export async function enrichJoinWithLabelColumns(
  pfDriver: PFrameDriver,
  pFrame: PFrameHandle,
  join: JoinEntry<PColumnIdAndSpec>,
): Promise<JoinEntry<PColumnIdAndSpec>> {
  const columns = getColumnsFromJoin(join);
  const labelColumns = await getLabelColumns(pfDriver, pFrame, columns);
  const missingLabelColumns = labelColumns.filter((column) => !lodash.find(columns, (c) => column.columnId === c.columnId));
  if (missingLabelColumns.length === 0) return join;
  return {
    type: 'outer',
    primary: join,
    secondary: missingLabelColumns.map((column) => ({
      type: 'column',
      column,
    })),
  };
}

export async function makeSheets(
  pfDriver: PFrameDriver,
  pFrameHandle: PFrameHandle,
  sheetAxes: AxisId[],
  join: JoinEntry<PColumnIdAndSpec>,
): Promise<PlDataTableSheet[]> {
  const axes = sheetAxes.filter((spec) => spec.type !== 'Bytes');

  const columns = getColumnsFromJoin(join);

  const mapping: [number, number][][] = axes.map((_) => []);
  const labelCol: (PObjectId | null)[] = axes.map((_) => null);
  for (let i = 0; i < columns.length; ++i) {
    const axesId = getAxesId(columns[i].spec.axesSpec);
    for (let j = 0; j < axesId.length; ++j) {
      const k = lodash.findIndex(axes, (axis) => lodash.isEqual(axis, axesId[j]));
      if (k === -1 || labelCol[k]) continue;

      if (axesId.length === 1 && columns[i].spec.name === 'pl7.app/label') {
        mapping[k] = [[i, j]];
        labelCol[k] = columns[i].columnId;
      } else {
        mapping[k].push([i, j]);
      }
    }
  }

  for (let i = axes.length - 1; i >= 0; --i) {
    if (!mapping[i].length) {
      labelCol.splice(i, 1);
      mapping.splice(i, 1);
      axes.splice(i, 1);
    }
  }

  const limit = 100;
  const possibleValues: Set<string | number>[] = axes.map((_) => new Set());

  loop1: for (let i = axes.length - 1; i >= 0; --i) {
    for (const [column, _] of mapping[i]) {
      const response = await pfDriver.getUniqueValues(pFrameHandle, {
        columnId: columns[column].columnId,
        ...(!labelCol[i] && { axis: lodash.cloneDeep(axes[i]) }),
        filters: [],
        limit,
      });
      if (response.overflow) {
        labelCol.splice(i, 1);
        mapping.splice(i, 1);
        axes.splice(i, 1);
        continue loop1;
      }

      const valueType = response.values.type;
      for (const value of response.values.data) {
        if (isValueNA(value, valueType) || value === null) continue;
        possibleValues[i].add(toDisplayValue(value, valueType));

        if (possibleValues[i].size === limit) {
          labelCol.splice(i, 1);
          mapping.splice(i, 1);
          axes.splice(i, 1);
          continue loop1;
        }
      }
    }

    if (!possibleValues[i].size) {
      labelCol.splice(i, 1);
      mapping.splice(i, 1);
      axes.splice(i, 1);
      continue loop1;
    }
  }

  return axes.map((axis, i) => {
    const options = [...possibleValues[i]].map((value) => ({
      value: value,
      text: value.toString(),
    }));
    const defaultValue = options[0].value;
    return {
      axis: lodash.cloneDeep(axis),
      ...(labelCol[i] && { column: labelCol[i] }),
      options,
      defaultValue,
    } as PlDataTableSheet;
  });
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
    row['id'] = iRow.toString();

    rowData.push(row);
  }

  return rowData;
}

const isLabelColumn = (col: PTableColumnSpec) => col.type === 'column' && col.spec.axesSpec.length === 1 && col.spec.name === 'pl7.app/label';

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
  datasource?: IDatasource;
  rowModelType: RowModelType;
  rowData?: unknown[];
}> {
  const specs = await pfDriver.getSpec(pt);

  // column indices in the specs array that we are going to process
  const indices = [...specs.keys()].filter(
    (i) => !lodash.find(sheets, (sheet) => lodash.isEqual(sheet.axis, specs[i].id) || lodash.isEqual(sheet.column, specs[i].id)),
  );
  const fields = lodash.cloneDeep(indices);

  // get columns with heterogeneous axes
  const hColumns = getHeterogeneousColumns(specs, indices);

  // process label columns
  for (let i = indices.length - 1; i >= 0; --i) {
    const idx = indices[i];
    if (!isLabelColumn(specs[idx])) continue;

    const axisId = getAxesId((specs[idx].spec as PColumnSpec).axesSpec)[0];
    const axisIdx = lodash.findIndex(indices, (idx) => lodash.isEqual(specs[idx].id, axisId));
    if (axisIdx === -1) continue;

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
  const columnDefs = fields.map((i) => getColDef(i, specs[i]));

  if (hColumns.length > 1) {
    console.warn('Currently, only one heterogeneous axis is supported in the table, got', hColumns.length, ' transposition will not be applied.');
  }

  if (hColumns.length === 1) {
    // return data
    return updatePFrameGridOptionsHeterogeneousAxes(hColumns, ptShape, columnDefs, await pfDriver.getData(pt, indices), fields, indices);
  }

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
    rowModelType: 'infinite',
    columnDefs,
    datasource,
  };
}
