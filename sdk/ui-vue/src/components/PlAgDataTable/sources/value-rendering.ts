import {
  Annotation,
  PTableNA,
  readAnnotation,
  ValueType,
  type PTableColumnSpec,
  type PTableValue,
} from "@platforma-sdk/model";
import type { ValueFormatterFunc } from "ag-grid-enterprise";
import type { PTableHidden } from "./common";
import { isPTableHidden } from "./common";
import * as d3 from "d3-format";
import type { PlAgDataTableV2Row } from "../types";

export function formatSpecialValues(
  value: undefined | PTableValue | PTableHidden,
  dataStatus: undefined | "absent" | "error" | "computing" | "ready",
): string | undefined {
  if (dataStatus === "absent") {
    return "absent";
  } else if (dataStatus === "error") {
    return "error";
  } else if (dataStatus === "computing") {
    return "computing...";
  } else if (isPTableHidden(value)) {
    return "loading...";
  } else if (value === PTableNA) {
    return "";
  } else {
    return undefined;
  }
}

export type ColumnRenderingSpec = {
  valueFormatter: ValueFormatterFunc<PlAgDataTableV2Row, PTableValue | PTableHidden>;
  fontFamily?: string;
};

export function getColumnRenderingSpec(spec: PTableColumnSpec): ColumnRenderingSpec {
  const valueType = spec.type === "axis" ? spec.spec.type : spec.spec.valueType;
  let renderSpec: ColumnRenderingSpec;
  switch (valueType) {
    case ValueType.Int:
    case ValueType.Long:
    case ValueType.Float:
    case ValueType.Double: {
      const format = readAnnotation(spec.spec, Annotation.Format);
      const dataStatus = readAnnotation(spec.spec, Annotation.DataStatus);
      const formatFn = format ? d3.format(format) : undefined;
      renderSpec = {
        valueFormatter: (params) => {
          const formatted = formatSpecialValues(params.value, dataStatus);
          if (formatted !== undefined) return formatted;
          return formatFn ? formatFn(Number(params.value)) : params.value!.toString();
        },
      };
      break;
    }
    default:
      renderSpec = {
        valueFormatter: (params) => {
          const formatted = formatSpecialValues(
            params.value,
            readAnnotation(spec.spec, Annotation.DataStatus),
          );
          if (formatted !== undefined) return formatted;
          return params.value!.toString();
        },
      };
      break;
  }
  const fontFamily = readAnnotation(spec.spec, Annotation.Table.FontFamily);
  if (fontFamily) renderSpec.fontFamily = fontFamily;
  return renderSpec;
}
