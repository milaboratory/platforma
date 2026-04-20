import {
  type PColumn,
  type PColumnSpec,
  type PFrameSpecDriver,
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
import type { ColumnMatcher, ColumnOrderRule, ColumnVisibilityRule } from "./createPlDataTableV3";
import type { ColumnSelector } from "../../../columns";
import { ArrayColumnProvider, ColumnCollectionBuilder } from "../../../columns";
import { isNil } from "es-toolkit";

/** Check if column should be omitted from the table */
export function isColumnHidden(spec: { annotations?: Annotation }): boolean {
  return readAnnotation(spec, Annotation.Table.Visibility) === "hidden";
}

/** Check if column is hidden by default */
export function isColumnOptional(spec: { annotations?: Annotation }): boolean {
  return readAnnotation(spec, Annotation.Table.Visibility) === "optional";
}

/** Column shape consumed by rule evaluation. */
export type RuleColumn = Pick<PColumn<PObjectId>, "id" | "spec">;

/** Get effective visibility for a column. Rule map lookup first, then annotation fallback. */
export function getEffectiveVisibility(
  col: RuleColumn,
  visibilityByColId?: Map<PObjectId, ColumnVisibilityRule>,
): undefined | "default" | "optional" | "hidden" {
  const rule = visibilityByColId?.get(col.id);
  if (rule !== undefined) return rule.visibility;
  if (isColumnHidden(col.spec)) return "hidden";
  if (isColumnOptional(col.spec)) return "optional";
  return undefined;
}

/** Get ordering priority for a column. Rule map lookup first, then annotation fallback. */
export function getOrderPriority(
  col: RuleColumn,
  orderByColId?: Map<PObjectId, ColumnOrderRule>,
): undefined | number {
  const rule = orderByColId?.get(col.id);
  if (rule !== undefined) return rule.priority;
  return readAnnotationJson(col.spec, Annotation.Table.OrderPriority);
}

/**
 * Evaluate display rules against a set of columns and return a map of `colId → winning rule`
 * (first-match-wins, preserving original rule order).
 *
 * Predicate-based rules (`ColumnMatcher`) are evaluated directly on the spec.
 * Selector-based rules (`ColumnSelector`) are matched via `PFrameSpecDriver.discoverColumns`
 * using the same engine as `ColumnCollection.findColumns` — no client-side matcher.
 */
export function evaluateRules<R extends { match: ColumnMatcher | ColumnSelector }>(
  rules: R[],
  columns: RuleColumn[],
  pframeSpec: PFrameSpecDriver,
): Map<PObjectId, R> {
  const result = new Map<PObjectId, R>();
  if (rules.length === 0 || columns.length === 0) return result;

  const hasSelectorRules = rules.some((rule) => typeof rule.match !== "function");
  const selectorHitsByRule = new Map<R, Set<PObjectId>>();

  if (hasSelectorRules) {
    const dedupedColumns = dedupeById(columns);
    const pColumns = dedupedColumns.map((c) => ({ id: c.id, spec: c.spec, data: undefined }));
    const collection = new ColumnCollectionBuilder(pframeSpec)
      .addSource(new ArrayColumnProvider(pColumns))
      .build();
    if (collection === undefined) return result;

    try {
      for (const rule of rules) {
        if (typeof rule.match === "function") continue;
        const hits = collection.findColumns({ include: rule.match });
        selectorHitsByRule.set(rule, new Set(hits.map((h) => h.id)));
      }
    } finally {
      collection.dispose();
    }
  }

  for (const col of columns) {
    for (const rule of rules) {
      const matches =
        typeof rule.match === "function"
          ? rule.match(col.spec)
          : (selectorHitsByRule.get(rule)?.has(col.id) ?? false);
      if (matches) {
        result.set(col.id, rule);
        break;
      }
    }
  }
  return result;
}

function dedupeById(columns: RuleColumn[]): RuleColumn[] {
  const seen = new Set<PObjectId>();
  const result: RuleColumn[] = [];
  for (const col of columns) {
    if (seen.has(col.id)) continue;
    seen.add(col.id);
    result.push(col);
  }
  return result;
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
 * Writes effective display properties (OrderPriority, Visibility) from precomputed rule maps
 * into column annotations. Returns new column objects — originals are not mutated.
 */
export function withTableVisualAnnotations<Data>(
  visibilityByColId: undefined | Map<PObjectId, ColumnVisibilityRule>,
  orderByColId: undefined | Map<PObjectId, ColumnOrderRule>,
  columns: PColumn<Data>[],
): PColumn<Data>[] {
  if (visibilityByColId === undefined && orderByColId === undefined) return columns;
  return columns.map((col) => {
    const annotations = { ...col.spec.annotations };

    const visibility = getEffectiveVisibility(col, visibilityByColId);
    if (!isNil(visibility)) annotations[Annotation.Table.Visibility] = visibility;

    const orderPriority = getOrderPriority(col, orderByColId);
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

export function withHidenAxesAnnotations<Data>(columns: PColumn<Data>[]): PColumn<Data>[] {
  return columns.map((col) => ({
    ...col,
    spec: {
      ...col.spec,
      axesSpec: col.spec.axesSpec.map((axis) => ({
        ...axis,
        annotations: { ...axis.annotations, [Annotation.Table.Visibility]: "hidden" },
      })),
    },
  }));
}

/** Column shape required by label derivation. */
export type LabelableColumn = {
  readonly id: PObjectId;
  readonly spec: PColumnSpec;
  readonly linkerPath?: { spec: PColumnSpec }[];
};

/** Derive labels for all table elements: columns via deriveDistinctLabels, axes from label columns. */
export function deriveAllLabels(options: {
  columns: LabelableColumn[];
  labelColumns: { readonly spec: PColumnSpec }[];
  deriveLabelsOptions?: DeriveLabelsOptions;
}): Record<string, string> {
  const { columns, labelColumns, deriveLabelsOptions } = options;
  const axisLabels = deriveAxisLabels(columns, labelColumns);
  const columnLabels = deriveDistinctLabels(columns, deriveLabelsOptions).reduce(
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
