import type {
  AxesSpec,
  PTableColumnId,
  PTableColumnSpecColumn,
  PTableValue,
} from "@platforma-sdk/model";
import {
  canonicalizeJson,
  getAxisId,
  pTableValue,
  type PFrameDriver,
  type PlDataTableSheet,
  type PTableVector,
  type AxisId,
  type PlDataTableModel,
  type PTableColumnSpec,
  type PTableKey,
  type PlTableColumnId,
  type PlTableColumnIdJson,
  isLabelColumn as isLabelColumnSpec,
  isLinkerColumn as isLinkerColumnSpec,
  isColumnHidden,
  isColumnOptional,
  matchAxisId,
  readAnnotation,
  readAnnotationJson,
  Annotation,
  ValueType,
  getPTableColumnId,
} from "@platforma-sdk/model";
import type {
  CellStyle,
  ColDef,
  GridApi,
  ICellRendererParams,
  IServerSideDatasource,
  IServerSideGetRowsParams,
  ManagedGridOptions,
} from "ag-grid-enterprise";
import type { PlAgHeaderComponentParams, PlAgHeaderComponentType } from "../../PlAgColumnHeader";
import { PlAgColumnHeader } from "../../PlAgColumnHeader";
import { PlAgTextAndButtonCell } from "../../PlAgTextAndButtonCell";
import type { PlAgDataTableV2Row, PlTableRowId } from "../types";
import { PTableHidden } from "./common";
import { defaultMainMenuItems } from "./menu-items";
import { makeRowNumberColDef, PlAgDataTableRowNumberColId } from "./row-number";
import { getColumnRenderingSpec } from "./value-rendering";
import type { Ref } from "vue";
import { isJsonEqual } from "@milaboratories/helpers";
import type { DeferredCircular } from "./focus-row";
import { isNil } from "es-toolkit";

export function isLabelColumn(column: PTableColumnSpec): column is PTableColumnSpecColumn {
  return column.type === "column" && isLabelColumnSpec(column.spec);
}

/** Convert columnar data from the driver to rows, used by ag-grid */
function columns2rows(
  fields: number[],
  columns: PTableVector[],
  axes: number[],
  resultMapping: number[],
): PlAgDataTableV2Row[] {
  const rowData: PlAgDataTableV2Row[] = [];
  for (let iRow = 0; iRow < columns[0].data.length; ++iRow) {
    const axesKey: PTableKey = axes.map((iAxis) =>
      pTableValue(columns[resultMapping[iAxis]], iRow),
    );
    const id = canonicalizeJson<PlTableRowId>(axesKey);
    const row: PlAgDataTableV2Row = { id, axesKey };
    fields.forEach((field, iCol) => {
      row[field.toString() as `${number}`] =
        resultMapping[iCol] === -1 ? PTableHidden : pTableValue(columns[resultMapping[iCol]], iRow);
    });
    rowData.push(row);
  }
  return rowData;
}

/** Calculate GridOptions for selected p-table data source */
export async function calculateGridOptions({
  generation,
  pfDriver,
  model,
  sheets,
  dataRenderedTracker,
  hiddenColIds,
  cellButtonAxisParams,
}: {
  generation: Ref<number>;
  pfDriver: PFrameDriver;
  model: PlDataTableModel;
  sheets: PlDataTableSheet[];
  dataRenderedTracker: DeferredCircular<GridApi<PlAgDataTableV2Row>>;
  hiddenColIds?: PlTableColumnIdJson[];
  cellButtonAxisParams?: PlAgCellButtonAxisParams;
}): Promise<
  Pick<ManagedGridOptions<PlAgDataTableV2Row>, "columnDefs" | "serverSideDatasource"> & {
    axesSpec: AxesSpec;
  }
> {
  const stateGeneration = generation.value;
  const stateChangedError = new Error("table state generation changed");

  // get specs of the full table
  const tableSpecs = await pfDriver.getSpec(model.fullTableHandle);
  if (stateGeneration !== generation.value) throw stateChangedError;
  // get specs of the visible table (with hidden columns omitted)
  const visibleTableSpecs = await pfDriver.getSpec(model.visibleTableHandle);
  if (stateGeneration !== generation.value) throw stateChangedError;

  // create index mapping from full specs to visible subset (hidden columns would have -1)
  const specId = (spec: PTableColumnSpec) =>
    canonicalizeJson<PTableColumnId>(getPTableColumnId(spec));
  const dataSpecsMap = new Map(visibleTableSpecs.entries().map(([i, spec]) => [specId(spec), i]));
  const specsToDataSpecsMapping = new Map(
    tableSpecs.entries().flatMap(([i, spec]) => {
      const dataSpecIdx = dataSpecsMap.get(specId(spec));
      return isNil(dataSpecIdx) ? [] : [[i, dataSpecIdx]];
    }),
  );

  // gether indices of columns that would be displayed in the table

  const sheetAxesIds = sheets.map((sheet) => getAxisId(sheet.axis));
  const isPartitionedAxis = (axisId: AxisId) => sheetAxesIds.some((id) => matchAxisId(id, axisId));

  const labelColumns: { axisId: AxisId; labelColumnIdx: number }[] = [];
  const setLabelColumnIndex = (axisId: AxisId, labelColumnIdx: number) => {
    if (!labelColumns.some((info) => matchAxisId(info.axisId, axisId))) {
      labelColumns.push({ axisId, labelColumnIdx });
    } else {
      console.warn(`multiple label columns match axisId: ${JSON.stringify(axisId)}`);
    }
  };
  const getLabelColumnIndex = (axisId: AxisId) => {
    return labelColumns.find((info) => matchAxisId(info.axisId, axisId))?.labelColumnIdx ?? -1;
  };

  // filter out partitioned axes, label columns and hidden columns
  let indices = tableSpecs
    .entries()
    .filter(([i, spec]) => {
      switch (spec.type) {
        case "axis":
          return !isPartitionedAxis(spec.id);
        case "column":
          if (isLabelColumnSpec(spec.spec)) {
            const labeledAxisId = getAxisId(spec.spec.axesSpec[0]);
            if (!isPartitionedAxis(labeledAxisId)) {
              setLabelColumnIndex(labeledAxisId, i);
            }
            return false;
          }
          return !isColumnHidden(spec.spec) && !isLinkerColumnSpec(spec.spec);
      }
    })
    .map(([i]) => i)
    .toArray();

  // order columns: axes first, then by OrderPriority annotation (higher = further left)
  indices.sort((a, b) => {
    if (tableSpecs[a].type !== tableSpecs[b].type) return tableSpecs[a].type === "axis" ? -1 : 1;
    const aPriority =
      tableSpecs[a].type === "column"
        ? (readAnnotationJson(tableSpecs[a].spec, Annotation.Table.OrderPriority) ?? 0)
        : 0;
    const bPriority =
      tableSpecs[b].type === "column"
        ? (readAnnotationJson(tableSpecs[b].spec, Annotation.Table.OrderPriority) ?? 0)
        : 0;
    return bPriority - aPriority;
  });

  // fields are indices of columns that would go to columnDefs
  const fields = [...indices];
  // replace axes with label columns
  indices = indices.map((i) => {
    const spec = tableSpecs[i];
    if (spec.type === "axis") {
      const labelColumnIdx = getLabelColumnIndex(spec.id);
      if (labelColumnIdx !== -1) {
        return labelColumnIdx;
      }
    }
    return i;
  });
  // When no saved state, compute default hidden columns from annotations
  if (isNil(hiddenColIds)) {
    hiddenColIds = fields.reduce<PlTableColumnIdJson[]>((acc, field, i) => {
      const spec = tableSpecs[field];
      if (spec.type === "column" && isColumnOptional(spec.spec)) {
        const labeledSpec = tableSpecs[indices[i]];
        acc.push(canonicalizeJson<PlTableColumnId>({ source: spec, labeled: labeledSpec }));
      }
      return acc;
    }, []);
  }

  const columnDefs: ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[] = [
    makeRowNumberColDef(),
    ...fields.map((field, index) =>
      makeColDef(
        field,
        tableSpecs[field],
        tableSpecs[indices[index]],
        hiddenColIds,
        cellButtonAxisParams,
      ),
    ),
  ];

  // mix in indices of skipped axes (axes that were partitioned or replaced with label columns)
  const axesSpec = tableSpecs
    .values()
    .filter((spec) => spec.type === "axis")
    .map((spec) => spec.spec)
    .toArray();
  const axes = axesSpec
    .keys()
    .map((i) => {
      let r = indices.indexOf(i);
      if (r === -1) {
        r = indices.length;
        indices.push(i);
      }
      return r;
    })
    .toArray();

  const requestIndices: number[] = [];
  const resultMapping: number[] = [];
  indices.forEach((idx) => {
    const dataSpecIdx = specsToDataSpecsMapping.get(idx);
    if (dataSpecIdx !== undefined) {
      resultMapping.push(requestIndices.length);
      requestIndices.push(dataSpecIdx);
    } else {
      resultMapping.push(-1);
    }
  });

  let rowCount = -1;
  let lastParams: IServerSideGetRowsParams | undefined = undefined;
  const serverSideDatasource: IServerSideDatasource<PlAgDataTableV2Row> = {
    getRows: async (params: IServerSideGetRowsParams) => {
      if (stateGeneration !== generation.value) return params.fail();
      try {
        if (rowCount === -1) {
          const ptShape = await pfDriver.getShape(model.visibleTableHandle);
          if (stateGeneration !== generation.value || params.api.isDestroyed())
            return params.fail();
          rowCount = ptShape.rows;
        }

        if (rowCount == 0) {
          params.success({ rowData: [], rowCount });
          // Warning: AgGrid cannot show two overlays at once,
          // so first hide loading overlay, then show no rows overlay
          params.api.setGridOption("loading", false);
          params.api.showNoRowsOverlay();
          return;
        }

        // If sort has changed - show skeletons instead of data
        if (lastParams && !isJsonEqual(lastParams.request.sortModel, params.request.sortModel)) {
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
            const data = await pfDriver.getData(model.visibleTableHandle, requestIndices, {
              offset: params.request.startRow,
              length,
            });
            if (stateGeneration !== generation.value || params.api.isDestroyed())
              return params.fail();
            rowData = columns2rows(fields, data, axes, resultMapping);
          }
        }

        params.success({ rowData, rowCount });
        params.api.autoSizeColumns(
          params.api
            .getAllDisplayedColumns()
            .filter((column) => column.getColId() !== PlAgDataTableRowNumberColId),
        );
        params.api.setGridOption("loading", false);
        dataRenderedTracker.resolve(params.api);
      } catch (error: unknown) {
        if (stateGeneration !== generation.value || params.api.isDestroyed()) return params.fail();
        params.api.setGridOption("loading", true);
        params.fail();
        console.trace(error);
      }
    },
  };

  return {
    axesSpec,
    columnDefs,
    serverSideDatasource,
  };
}

export type PlAgCellButtonAxisParams = {
  showCellButtonForAxisId?: AxisId;
  cellButtonInvokeRowsOnDoubleClick?: boolean;
  trigger: (key?: PTableKey) => void;
};

/**
 * Calculates column definition for a given p-table column
 */
export function makeColDef(
  iCol: number,
  spec: PTableColumnSpec,
  labeledSpec: PTableColumnSpec,
  hiddenColIds: PlTableColumnIdJson[] | undefined,
  cellButtonAxisParams?: PlAgCellButtonAxisParams,
): ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden> {
  const colId = canonicalizeJson<PlTableColumnId>({
    source: spec,
    labeled: labeledSpec,
  });
  const valueType = spec.type === "axis" ? spec.spec.type : spec.spec.valueType;
  const columnRenderingSpec = getColumnRenderingSpec(spec);
  const cellStyle: CellStyle = {};
  if (columnRenderingSpec.fontFamily) {
    if (columnRenderingSpec.fontFamily === "monospace") {
      cellStyle.fontFamily = "Spline Sans Mono";
      cellStyle.fontWeight = 300;
    } else {
      cellStyle.fontFamily = columnRenderingSpec.fontFamily;
    }
  }
  const headerName =
    readAnnotation(spec.spec, Annotation.Label)?.trim() ?? `Unlabeled ${spec.type} ${iCol}`;

  return {
    colId,
    mainMenuItems: defaultMainMenuItems,
    context: spec,
    field: `${iCol}`,
    headerName,
    lockPosition: spec.type === "axis",
    hide: hiddenColIds !== undefined && hiddenColIds.includes(colId),
    valueFormatter: columnRenderingSpec.valueFormatter,
    headerComponent: PlAgColumnHeader,
    cellRendererSelector: cellButtonAxisParams?.showCellButtonForAxisId
      ? (params: ICellRendererParams) => {
          if (spec.type !== "axis") return;

          const axisId = (params.colDef?.context as PTableColumnSpec)?.id as AxisId;
          if (isJsonEqual(axisId, cellButtonAxisParams.showCellButtonForAxisId)) {
            return {
              component: PlAgTextAndButtonCell,
              params: {
                invokeRowsOnDoubleClick: cellButtonAxisParams.cellButtonInvokeRowsOnDoubleClick,
                onClick: (params: ICellRendererParams<PlAgDataTableV2Row>) => {
                  cellButtonAxisParams.trigger(params.data?.axesKey);
                },
              },
            };
          }
        }
      : undefined,
    cellStyle,
    headerComponentParams: {
      type: ((): PlAgHeaderComponentType => {
        switch (valueType) {
          case ValueType.Int:
          case ValueType.Long:
          case ValueType.Float:
          case ValueType.Double:
            return "Number";
          case ValueType.String:
          case ValueType.Bytes:
            return "Text";
          default:
            throw Error(`unsupported data type: ${valueType}`);
        }
      })(),
      tooltip: readAnnotation(labeledSpec.spec, Annotation.Description)?.trim(),
    } satisfies PlAgHeaderComponentParams,
    cellDataType: (() => {
      switch (valueType) {
        case ValueType.Int:
        case ValueType.Long:
        case ValueType.Float:
        case ValueType.Double:
          return "number";
        case ValueType.String:
        case ValueType.Bytes:
          return "text";
        default:
          throw Error(`unsupported data type: ${valueType}`);
      }
    })(),
  };
}
