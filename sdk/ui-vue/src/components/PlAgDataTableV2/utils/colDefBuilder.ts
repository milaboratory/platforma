import type {
  AxisId,
  PTableColumnSpec,
  PTableValue,
  PlTableColumnId,
  PlTableColumnIdJson,
} from "@platforma-sdk/model";
import {
  Annotation,
  ValueType,
  canonicalizeJson,
  isColumnOptional,
  readAnnotation,
} from "@platforma-sdk/model";
import type { CellStyle, ColDef, ICellRendererParams } from "ag-grid-enterprise";
import type { PlAgHeaderComponentParams, PlAgHeaderComponentType } from "../../PlAgColumnHeader";
import { PlAgColumnHeader } from "../../PlAgColumnHeader";
import { PlAgTextAndButtonCell } from "../../PlAgTextAndButtonCell";
import type { PlAgDataTableV2Row } from "../../PlAgDataTable/types";
import type { PTableHidden } from "../../PlAgDataTable/sources/common";
import { defaultMainMenuItems } from "../../PlAgDataTable/sources/menu-items";
import { getColumnRenderingSpec } from "../../PlAgDataTable/sources/value-rendering";
import { isJsonEqual } from "@milaboratories/helpers";
import type { CellButtonAxisParameters } from "../types";

/**
 * Computes default hidden column IDs from annotations.
 * Columns marked as optional are hidden by default when no saved state exists.
 */
export function computeDefaultHidden(
  fields: number[],
  indices: number[],
  fullSpecs: PTableColumnSpec[],
): PlTableColumnIdJson[] {
  return fields.reduce<PlTableColumnIdJson[]>((acc, field, i) => {
    const spec = fullSpecs[field];
    if (spec.type === "column" && isColumnOptional(spec.spec)) {
      const labeledSpec = fullSpecs[indices[i]];
      acc.push(canonicalizeJson<PlTableColumnId>({ source: spec, labeled: labeledSpec }));
    }
    return acc;
  }, []);
}

/**
 * Builds a ColDef for a single p-table column.
 */
export function makeColDef(
  iCol: number,
  spec: PTableColumnSpec,
  labeledSpec: PTableColumnSpec,
  hiddenColIds: PlTableColumnIdJson[] | undefined,
  cellButtonAxisParams?: CellButtonAxisParameters,
): ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden> {
  const colId = canonicalizeJson<PlTableColumnId>({
    source: spec,
    labeled: labeledSpec,
  });
  const valueType = spec.type === "axis" ? spec.spec.type : spec.spec.valueType;
  const columnRenderingSpec = getColumnRenderingSpec(spec);
  const cellStyle: CellStyle = {};
  if (columnRenderingSpec.fontFamily !== undefined) {
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
    cellRendererSelector:
      cellButtonAxisParams?.showCellButtonForAxisId !== undefined
        ? (params: ICellRendererParams) => {
            if (spec.type !== "axis") return;

            const axisId = (params.colDef?.context as PTableColumnSpec)?.id as AxisId;
            if (isJsonEqual(axisId, cellButtonAxisParams.showCellButtonForAxisId)) {
              return {
                component: PlAgTextAndButtonCell,
                params: {
                  invokeRowsOnDoubleClick: cellButtonAxisParams.cellButtonInvokeRowsOnDoubleClick,
                  onClick: (cellParams: ICellRendererParams<PlAgDataTableV2Row>) => {
                    cellButtonAxisParams.trigger(cellParams.data?.axesKey);
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
