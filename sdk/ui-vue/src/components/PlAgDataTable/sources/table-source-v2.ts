import type {
  AxesSpec,
  PTableColumnId,
  PTableColumnSpecAxis,
  PTableColumnSpecColumn,
  PTableHandle,
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
import { isNil, uniq } from "es-toolkit";

export function isLabelColumn(column: PTableColumnSpec): column is PTableColumnSpecColumn {
  return column.type === "column" && isLabelColumnSpec(column.spec);
}

/** Convert columnar data from the driver to rows, used by ag-grid */
function columns2rows(
  fields: number[],
  columns: PTableVector[],
  fieldResultMapping: number[],
  axesResultIndices: number[],
): PlAgDataTableV2Row[] {
  const rowData: PlAgDataTableV2Row[] = [];
  for (let iRow = 0; iRow < columns[0].data.length; ++iRow) {
    const axesKey: PTableKey = axesResultIndices.map((ri) => pTableValue(columns[ri], iRow));
    const id = canonicalizeJson<PlTableRowId>(axesKey);
    const row = fields.reduce<PlAgDataTableV2Row>(
      (acc, field, iCol) => {
        acc[field.toString() as `${number}`] =
          fieldResultMapping[iCol] === -1
            ? PTableHidden
            : pTableValue(columns[fieldResultMapping[iCol]], iRow);
        return acc;
      },
      { id, axesKey },
    );

    rowData.push(row);
  }
  return rowData;
}

/** Calculate GridOptions for selected p-table data source */
export async function calculateGridOptions({
  generation,
  pfDriver,
  sheets,
  fullTableHandle,
  visibleTableHandle,
  dataRenderedTracker,
  hiddenColIds,
  cellButtonAxisParams,
}: {
  sheets: PlDataTableSheet[];
  pfDriver: PFrameDriver;
  generation: Ref<number>;
  fullTableHandle: PTableHandle;
  visibleTableHandle: PTableHandle;
  dataRenderedTracker: DeferredCircular<GridApi<PlAgDataTableV2Row>>;
  hiddenColIds?: PlTableColumnIdJson[];
  cellButtonAxisParams?: PlAgCellButtonAxisParams;
}): Promise<
  Pick<ManagedGridOptions<PlAgDataTableV2Row>, "columnDefs" | "serverSideDatasource"> & {
    axesSpec: AxesSpec;
  }
> {
  const stateGeneration = generation.value;

  // get specs of the full table
  const [tableSpecs, visibleTableSpecs] = await Promise.all([
    pfDriver.getSpec(fullTableHandle),
    pfDriver.getSpec(visibleTableHandle),
  ]);

  if (stateGeneration !== generation.value) throw new Error("table state generation changed");

  // index mapping from full specs to visible subset (hidden columns → -1)
  const specsToVisibleSpecsMapping = buildSpecsToVisibleSpecsMapping(tableSpecs, visibleTableSpecs);

  const isPartitionedAxis = createPartitionedAxisPredicate(sheets);

  // label columns indexed by labeled axis (for axis→label replacement later)
  const getLabelColumnIndex = collectLabelColumnsByAxis(tableSpecs, isPartitionedAxis);

  // displayable column indices ordered: axes first, then columns by OrderPriority
  const fields = sortIndicesByTypeAndPriority(
    selectDisplayableIndices(tableSpecs, isPartitionedAxis),
    tableSpecs,
  );

  // same as fields, but each axis replaced by its label column index when available
  const indices = replaceAxesWithLabelColumns(fields, tableSpecs, getLabelColumnIndex);

  // default hidden columns derived from Optional annotation when no saved state
  const resolvedHiddenColIds =
    hiddenColIds ?? computeDefaultHiddenColIds(fields, indices, tableSpecs);

  const columnDefs: ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[] = [
    makeRowNumberColDef(),
    ...fields.map((field, index) =>
      makeColDef(
        field,
        tableSpecs[field],
        tableSpecs[indices[index]],
        resolvedHiddenColIds,
        cellButtonAxisParams,
      ),
    ),
  ];

  // axes — taken directly from visible table (always present as part of join)
  const visibleAxes = collectVisibleAxes(visibleTableSpecs);

  // request indices: non-hidden display fields + visible axes for row selection keys.
  // Axes replaced by label columns request label data (display); original axis values
  // are fetched via visibleAxes (row keys).
  const { requestIndices, fieldResultMapping, axesResultIndices } = buildRequestIndices(
    indices,
    specsToVisibleSpecsMapping,
    visibleAxes.map(([i]) => i),
  );

  let rowCount = -1;
  let lastParams: IServerSideGetRowsParams | undefined = undefined;
  const serverSideDatasource: IServerSideDatasource<PlAgDataTableV2Row> = {
    getRows: async (params: IServerSideGetRowsParams) => {
      if (stateGeneration !== generation.value) return params.fail();
      try {
        if (rowCount === -1) {
          const ptShape = await pfDriver.getShape(visibleTableHandle);
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
            const data = await pfDriver.getData(visibleTableHandle, requestIndices, {
              offset: params.request.startRow,
              length,
            });
            if (stateGeneration !== generation.value || params.api.isDestroyed())
              return params.fail();
            rowData = columns2rows(fields, data, fieldResultMapping, axesResultIndices);
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
    axesSpec: visibleAxes.map(([, { spec }]) => spec),
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
    readAnnotation(labeledSpec.spec, Annotation.Label)?.trim() ??
    readAnnotation(spec.spec, Annotation.Label)?.trim() ??
    `Unlabeled ${spec.type} ${iCol}`;

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

type LabelColumnLookup = (axisId: AxisId) => number;

/** Build index mapping from full tableSpecs to their position in visibleTableSpecs (missing → -1). */
function buildSpecsToVisibleSpecsMapping(
  tableSpecs: PTableColumnSpec[],
  visibleTableSpecs: PTableColumnSpec[],
): Map<number, number> {
  const specId = (spec: PTableColumnSpec) =>
    canonicalizeJson<PTableColumnId>(getPTableColumnId(spec));
  const visibleSpecsMap = new Map(
    visibleTableSpecs.entries().map(([i, spec]) => [specId(spec), i] as const),
  );
  return new Map(
    tableSpecs.entries().map(([i, spec]) => {
      const visibleSpecIdx = visibleSpecsMap.get(specId(spec));
      return [i, isNil(visibleSpecIdx) ? -1 : visibleSpecIdx];
    }),
  );
}

/** Predicate that returns true when an axis is one of the sheet partition axes. */
function createPartitionedAxisPredicate(sheets: PlDataTableSheet[]): (axisId: AxisId) => boolean {
  const sheetAxesIds = sheets.map((sheet) => getAxisId(sheet.axis));
  return (axisId) => sheetAxesIds.some((id) => matchAxisId(id, axisId));
}

/**
 * Collect label columns (skipping partitioned axes and duplicates) and return a
 * lookup function that resolves labeled axisId → label column index (or -1).
 */
function collectLabelColumnsByAxis(
  tableSpecs: PTableColumnSpec[],
  isPartitionedAxis: (axisId: AxisId) => boolean,
): LabelColumnLookup {
  const labelColumns: { axisId: AxisId; labelColumnIdx: number }[] = [];
  for (const [i, spec] of tableSpecs.entries()) {
    if (spec.type !== "column" || !isLabelColumnSpec(spec.spec)) continue;
    const labeledAxisId = getAxisId(spec.spec.axesSpec[0]);
    if (isPartitionedAxis(labeledAxisId)) continue;
    if (labelColumns.some((info) => matchAxisId(info.axisId, labeledAxisId))) {
      console.warn(`multiple label columns match axisId: ${JSON.stringify(labeledAxisId)}`);
      continue;
    }
    labelColumns.push({ axisId: labeledAxisId, labelColumnIdx: i });
  }
  return (axisId) =>
    labelColumns.find((info) => matchAxisId(info.axisId, axisId))?.labelColumnIdx ?? -1;
}

/** Indices of columns to display: drop partitioned axes, label/linker columns, hidden columns. */
function selectDisplayableIndices(
  tableSpecs: PTableColumnSpec[],
  isPartitionedAxis: (axisId: AxisId) => boolean,
): number[] {
  return tableSpecs
    .entries()
    .filter(([, spec]) => {
      switch (spec.type) {
        case "axis":
          return !isPartitionedAxis(spec.id);
        case "column":
          return (
            !isLabelColumnSpec(spec.spec) &&
            !isColumnHidden(spec.spec) &&
            !isLinkerColumnSpec(spec.spec)
          );
      }
    })
    .map(([i]) => i)
    .toArray();
}

/** Sort: axes first, then columns by OrderPriority annotation (higher priority = further left). */
function sortIndicesByTypeAndPriority(indices: number[], tableSpecs: PTableColumnSpec[]): number[] {
  const priorityOf = (i: number): number => {
    const spec = tableSpecs[i];
    return spec.type === "column"
      ? (readAnnotationJson(spec.spec, Annotation.Table.OrderPriority) ?? 0)
      : 0;
  };
  return [...indices].sort((a, b) => {
    if (tableSpecs[a].type !== tableSpecs[b].type) {
      return tableSpecs[a].type === "axis" ? -1 : 1;
    }
    return priorityOf(b) - priorityOf(a);
  });
}

/** For each axis entry substitute the index of its matching label column when one exists. */
function replaceAxesWithLabelColumns(
  fields: number[],
  tableSpecs: PTableColumnSpec[],
  getLabelColumnIndex: LabelColumnLookup,
): number[] {
  return fields.map((i) => {
    const spec = tableSpecs[i];
    const labelIdx = spec.type === "axis" ? getLabelColumnIndex(spec.id) : -1;
    return labelIdx === -1 ? i : labelIdx;
  });
}

/** Default hidden col ids built from columns marked with the Optional annotation. */
function computeDefaultHiddenColIds(
  fields: number[],
  indices: number[],
  tableSpecs: PTableColumnSpec[],
): PlTableColumnIdJson[] {
  return fields.reduce<PlTableColumnIdJson[]>((acc, field, i) => {
    const spec = tableSpecs[field];
    if (spec.type !== "column" || !isColumnOptional(spec.spec)) return acc;
    const labeledSpec = tableSpecs[indices[i]];
    return [...acc, canonicalizeJson<PlTableColumnId>({ source: spec, labeled: labeledSpec })];
  }, []);
}

/** Extract axis indices and specs from the visible table (always present as part of join). */
function collectVisibleAxes(
  visibleTableSpecs: PTableColumnSpec[],
): [number, PTableColumnSpecAxis][] {
  return visibleTableSpecs
    .entries()
    .filter((entry): entry is [number, PTableColumnSpecAxis] => entry[1].type === "axis")
    .toArray();
}

/**
 * Compose request indices for the visible table:
 * non-hidden display fields first, then visible axes (deduplicated).
 * Returns fieldResultMapping (display field → position in requestIndices, -1 if not requested)
 * and axesResultIndices (visible axis → position in requestIndices).
 */
function buildRequestIndices(
  indices: number[],
  specsToVisibleSpecsMapping: Map<number, number>,
  visibleAxesIndices: number[],
): {
  requestIndices: number[];
  fieldResultMapping: number[];
  axesResultIndices: number[];
} {
  const resolved = indices.map((displayField) => {
    const idx = specsToVisibleSpecsMapping.get(displayField);
    return idx === undefined || idx === -1 ? null : idx;
  });
  const requestedFields = resolved.filter((v): v is number => v !== null);

  const fieldResultMapping: number[] = [];
  let pos = 0;
  for (const v of resolved) {
    fieldResultMapping.push(v === null ? -1 : pos++);
  }

  const requestIndices = uniq([...requestedFields, ...visibleAxesIndices]);
  const axesResultIndices = visibleAxesIndices.map((vi) => requestIndices.indexOf(vi));
  return { requestIndices, fieldResultMapping, axesResultIndices };
}
