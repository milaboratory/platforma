import type { AxisSpec } from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../../render";
import type { PlDataTableSheet } from "./typesV8";

/**
 * Create sheet entries for PlDataTable. The user picks one value of the axis at
 * a time, or, with `selection: "multiple"`, any number of them or all.
 */
export function createPlDataTableSheet<A, U>(
  ctx: RenderCtxBase<A, U>,
  axis: AxisSpec,
  values: (string | number)[],
  options: { selection: PlDataTableSheet["selection"] } = { selection: "single" },
): PlDataTableSheet {
  const labels = ctx.resultPool.findLabels(axis);
  return {
    axis,
    options: values.map((v) => ({
      value: v,
      label: labels?.[v] ?? v.toString(),
    })),
    defaultValue: values[0],
    selection: options.selection,
  };
}
