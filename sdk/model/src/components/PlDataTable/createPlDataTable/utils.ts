import {
  type PColumn,
  type PColumnSpec,
  type PObjectId,
  Annotation,
  canonicalizeAxisId,
  canonicalizeJson,
  getAxisId,
  readAnnotation,
  readAnnotationJson,
} from "@milaboratories/pl-model-common";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
} from "../../../labels/derive_distinct_labels";
import type { ColumnsDisplayOptions } from "./createPlDataTableV3";
import { isNil } from "es-toolkit";

/** Check if column should be omitted from the table */
export function isColumnHidden(spec: { annotations?: Annotation }): boolean {
  return readAnnotation(spec, Annotation.Table.Visibility) === "hidden";
}

/** Check if column is hidden by default */
export function isColumnOptional(spec: { annotations?: Annotation }): boolean {
  return readAnnotation(spec, Annotation.Table.Visibility) === "optional";
}

/** Get effective visibility for a column, considering display config rules first, then annotations. */
export function getEffectiveVisibility(
  spec: PColumnSpec,
  displayConfig?: ColumnsDisplayOptions,
): undefined | "default" | "optional" | "hidden" {
  if (displayConfig?.visibility) {
    for (const rule of displayConfig.visibility) {
      if (rule.match(spec)) {
        return rule.visibility;
      }
    }
  }
  if (isColumnHidden(spec)) return "hidden";
  if (isColumnOptional(spec)) return "optional";
  return undefined;
}

/** Get ordering priority for a column. Display config rules first, then annotation fallback. */
export function getOrderPriority(
  spec: PColumnSpec,
  displayConfig?: ColumnsDisplayOptions,
): undefined | number {
  if (displayConfig?.ordering) {
    for (const rule of displayConfig.ordering) {
      if (rule.match(spec)) {
        return rule.priority;
      }
    }
  }
  return readAnnotationJson(spec, Annotation.Table.OrderPriority);
}

/**
 * Writes derived labels into column and axis annotations.
 * Returns new column objects with modified specs — original columns are not mutated.
 *
 * For each column: writes derived label into Annotation.Label (if present in derivedLabels).
 * For each axis in column specs: writes derived axis label into AxisSpec annotations.
 */
export function withLabelAnnotations<Data>(
  derivedLabels: undefined | Record<string, string>,
  columns: PColumn<Data>[],
): PColumn<Data>[] {
  if (derivedLabels === undefined) return columns;
  return columns.map((col) => {
    const colLabel = derivedLabels[col.id];
    return {
      ...col,
      spec: {
        ...col.spec,
        ...(isNil(colLabel)
          ? {}
          : { annotations: { ...col.spec.annotations, [Annotation.Label]: colLabel } }),
        axesSpec: col.spec.axesSpec.map((axis) => {
          const label = derivedLabels[canonicalizeAxisId(axis)];
          return isNil(label)
            ? axis
            : { ...axis, annotations: { ...axis.annotations, [Annotation.Label]: label } };
        }),
      },
    };
  });
}

/**
 * Writes effective display properties (OrderPriority, Visibility) from ColumnDisplayOptions
 * into column annotations. Returns new column objects — originals are not mutated.
 */
export function withTableVisualAnnotations<Data>(
  displayOptions: undefined | ColumnsDisplayOptions,
  columns: PColumn<Data>[],
): PColumn<Data>[] {
  if (displayOptions === undefined) return columns;
  return columns.map((col) => {
    const annotations = { ...col.spec.annotations };

    const visibility = getEffectiveVisibility(col.spec, displayOptions);
    if (!isNil(visibility)) annotations[Annotation.Table.Visibility] = visibility;

    const orderPriority = getOrderPriority(col.spec, displayOptions);
    if (!isNil(orderPriority)) annotations[Annotation.Table.OrderPriority] = String(orderPriority);

    return {
      ...col,
      spec: {
        ...col.spec,
        annotations: annotations,
      },
    };
  });
}

/** Column shape required by label derivation. */
export type LabelableColumn = {
  readonly id: PObjectId;
  readonly spec: PColumnSpec;
  readonly linkerPath?: readonly { readonly column: { readonly spec: PColumnSpec } }[];
};

/** Derive labels for all table elements: columns via deriveDistinctLabels, axes from label columns. */
export function deriveAllLabels(options: {
  columns: LabelableColumn[];
  labelColumns: { readonly spec: PColumnSpec }[];
  deriveLabelsOptions?: DeriveLabelsOptions;
}): Record<string, string> {
  const { columns, labelColumns, deriveLabelsOptions } = options;
  const axisLabels = deriveAxisLabels(columns, labelColumns);
  const columnLabels = deriveDistinctLabels(
    columns.map((dc) => ({
      spec: dc.spec,
      linkersPath: dc.linkerPath?.map((step) => ({ spec: step.column.spec })),
    })),
    deriveLabelsOptions,
  ).reduce(
    (acc, label, index) => ((acc[columns[index].id] = label), acc),
    {} as Record<string, string>,
  );
  return { ...axisLabels, ...columnLabels };
}

/** Derive axis labels from matching label columns, falling back to axis spec annotations. */
function deriveAxisLabels(
  columns: { readonly spec: PColumnSpec }[],
  labelColumns: { readonly spec: PColumnSpec }[],
): Record<string, string> {
  const axisSpecMap = new Map(
    columns.flatMap((c) => c.spec.axesSpec).map((a) => [canonicalizeJson(getAxisId(a)), a]),
  );
  const result: Record<string, string> = {};
  for (const axisKey of axisSpecMap.keys()) {
    const labelCol = labelColumns.find(
      (lc) => canonicalizeJson(getAxisId(lc.spec.axesSpec[0])) === axisKey,
    );
    const source = labelCol?.spec ?? axisSpecMap.get(axisKey);
    result[axisKey] = readAnnotation(source ?? {}, Annotation.Label)?.trim() ?? "Unlabeled";
  }
  return result;
}
