import type {
  ColDef,
  IServerSideDatasource,
  IServerSideGetRowsParams,
  RowModelType,
} from 'ag-grid-enterprise';
import type {
  PlDataTableGridStateWithoutSheets,
  PlDataTableModel,
  PTableColumnSpec,
} from '@platforma-sdk/model';
import {
  getAxisId,
  pTableValue,
  type PColumnSpec,
  type PFrameDriver,
  type PlDataTableSheet,
  type PTableVector,
} from '@platforma-sdk/model';
import * as lodash from 'lodash';
import type { PlAgDataTableRow } from '../types';
import { makeRowNumberColDef, PlAgDataTableRowNumberColId } from './row-number';
import { objectHash } from '../../../objectHash';
import type { Ref } from 'vue';
import {
  isLabelColumn,
  makeColDef,
  makeRowId,
  PTableHidden,
  type PlAgCellButtonAxisParams,
} from './common';
import canonicalize from 'canonicalize';

/** Convert columnar data from the driver to rows, used by ag-grid */
function columns2rows(
  fields: number[],
  columns: PTableVector[],
  axes: number[],
  resultMapping: number[],
): PlAgDataTableRow[] {
  const rowData: PlAgDataTableRow[] = [];
  for (let iRow = 0; iRow < columns[0].data.length; ++iRow) {
    const key = axes.map((iAxis) => pTableValue(columns[resultMapping[iAxis]], iRow));
    const row: PlAgDataTableRow = { id: makeRowId(key), key };
    fields.forEach((field, iCol) => {
      row[field.toString() as `${number}`] = resultMapping[iCol] === -1
        ? PTableHidden
        : pTableValue(columns[resultMapping[iCol]], iRow);
    });
    rowData.push(row);
  }
  return rowData;
}

/**
 * Calculate GridOptions for p-table data source type
 */
export async function updatePFrameGridOptions(
  pfDriver: PFrameDriver,
  model: PlDataTableModel,
  sheets: PlDataTableSheet[],
  clientSide: boolean,
  gridState: Ref<PlDataTableGridStateWithoutSheets>,
  cellButtonAxisParams?: PlAgCellButtonAxisParams,
): Promise<{
    columnDefs: ColDef[];
    serverSideDatasource?: IServerSideDatasource;
    rowModelType: RowModelType;
    rowData?: PlAgDataTableRow[];
  }> {
  const pt = model.tableHandle;
  const specs = model.tableSpec;
  type SpecId = string;
  const specId = (spec: PTableColumnSpec): SpecId =>
    spec.type === 'axis' ? canonicalize(spec.spec)! : spec.id;
  const dataSpecs = await pfDriver.getSpec(pt);
  const dataSpecsMap = new Map<SpecId, number>();
  dataSpecs.forEach((spec, i) => {
    dataSpecsMap.set(specId(spec), i);
  });
  const specsToDataSpecsMapping = new Map<number, number>();
  specs.forEach((spec, i) => {
    const dataSpecIdx = dataSpecsMap.get(specId(spec));
    specsToDataSpecsMapping.set(i, dataSpecIdx ?? -1);
  });

  const oldSourceId = gridState.value.sourceId;

  const newSourceId = await objectHash(specs);

  const isSourceIdChanged = oldSourceId !== newSourceId;

  const columnVisibility = isSourceIdChanged ? undefined : gridState.value.columnVisibility;

  if (isSourceIdChanged) {
    gridState.value = {
      ...gridState.value,
      sourceId: newSourceId,
    };
  }

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

  const fields = [...indices];

  // process label columns
  const firstColumnIdx = indices.findIndex((i) => specs[i].type === 'column');
  for (let i = indices.length - 1; i >= firstColumnIdx; --i) {
    const idx = indices[i];
    if (!isLabelColumn(specs[idx])) continue;

    // axis of labels
    const axisId = getAxisId((specs[idx].spec as PColumnSpec).axesSpec[0]);
    const axisIdx = indices.findIndex((idx) => lodash.isEqual(specs[idx].id, axisId));
    if (axisIdx !== -1) {
      indices[axisIdx] = idx;
    } else {
      console.warn(`multiple label columns match axisId: ${JSON.stringify(axisId)}`);
    }

    // remove original axis
    indices.splice(i, 1);
    fields.splice(i, 1);
  }

  const ptShape = await pfDriver.getShape(pt);
  const rowCount = ptShape.rows;
  const columnDefs: ColDef<PlAgDataTableRow>[] = [
    makeRowNumberColDef(),
    ...fields.map((i) => makeColDef(i, specs[i], columnVisibility?.hiddenColIds, cellButtonAxisParams)),
  ];

  // mixing in axis indices

  const allIndices = [...indices];

  // axisIdx (0..<axesCount) -> idx in allIndices array
  const axisToFieldIdx = new Map<number, number>();
  for (let i = 0; i < numberOfAxes; ++i) axisToFieldIdx.set(i, -1);

  allIndices.forEach((idx, i) => {
    if (axisToFieldIdx.has(idx)) axisToFieldIdx.set(idx, i);
  });
  // at this point we have axis indices that are not listed in indices set to -1 in axisToFieldIdx

  // adding those indices at the end of allIndices array, to make sure we have all the axes in our response
  for (const [key, value] of axisToFieldIdx) {
    if (value === -1) {
      axisToFieldIdx.set(key, allIndices.length /* at this index value will be inserted in the next line */);
      allIndices.push(key);
    }
  }

  // indices of axes in allIndices array
  const axes: number[] = [];
  for (let i = 0; i < numberOfAxes; ++i) {
    const fieldIdx = axisToFieldIdx.get(i);
    if (fieldIdx === undefined || fieldIdx === -1) throw new Error('assertion exception');
    axes.push(fieldIdx);
  }

  const requestIndices: number[] = [];
  const resultMapping: number[] = [];
  allIndices.forEach((idx) => {
    const dataSpecIdx = specsToDataSpecsMapping.get(idx)!;
    if (dataSpecIdx !== -1) {
      resultMapping.push(requestIndices.length);
      requestIndices.push(dataSpecIdx);
    } else {
      resultMapping.push(-1);
    }
  });

  if (clientSide) {
    const data = await pfDriver.getData(pt, requestIndices);
    return {
      rowModelType: 'clientSide',
      columnDefs,
      rowData: columns2rows(fields, data, axes, resultMapping),
    };
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
        let rowData: PlAgDataTableRow[] = [];
        if (rowCount > 0 && params.request.startRow !== undefined && params.request.endRow !== undefined) {
          length = Math.min(rowCount, params.request.endRow) - params.request.startRow;
          if (length > 0) {
            const data = await pfDriver.getData(pt, requestIndices, {
              offset: params.request.startRow,
              length,
            });
            rowData = columns2rows(fields, data, axes, resultMapping);
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
