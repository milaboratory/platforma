import {
  type AnnotationDataStatus,
  type ColumnUniversalId,
  type PColumn,
  type PColumnSpec,
  type PObjectId,
  Annotation,
  extractPObjectId,
  readAnnotation,
} from "@milaboratories/pl-model-common";
import {
  deriveDistinctLabels,
  type DeriveLabelsOptions,
} from "../../../labels/derive_distinct_labels";
import {
  deriveDistinctTooltips,
  type TooltipEntry,
} from "../../../labels/derive_distinct_tooltips";
import type { ColumnOrderRule, ColumnVisibilityRule } from "./createPlDataTableV3";
import type { ColumnSelector, MatchQualifications } from "@milaboratories/pl-model-common";
import { ColumnsCollection, hasColumnData, type ColumnRecipe } from "../../../columns";
import type { GlobalCfgRenderCtx } from "../../../render/internal";
import { isNil, uniqBy } from "es-toolkit";
import { getField } from "@milaboratories/helpers";

/** Adapt a {@link ColumnRecipe} to the plain {@link RuleColumn} shape. */
export function toRuleColumn(col: ColumnRecipe): RuleColumn {
  return { id: extractPObjectId(col.id), spec: col.getSpec() };
}

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
  const annotation = Number(readAnnotation(col.spec, Annotation.Table.OrderPriority));
  return isNaN(annotation) ? undefined : annotation;
}

/**
 * Evaluate display rules against a set of columns and return a map of `colId → winning rule`
 * (first-match-wins, preserving original rule order).
 *
 * Predicate-based rules (`ColumnMatcher`) are evaluated directly on the spec.
 * Selector-based rules (`ColumnSelector`) are matched via the
 * `columnsCollection` service — the inline column ids must be resolvable in
 * the active render ctx for the host to read their specs.
 */
export function evaluateRules<R extends { match: ColumnSelector }>(
  rules: R[],
  columns: ColumnRecipe[],
): Map<PObjectId, R> {
  const result = new Map<PObjectId, R>();
  if (rules.length === 0 || columns.length === 0) return result;

  const selectorRules = rules.filter((rule) => typeof rule.match !== "function");
  const selectorHitsByRule = new Map<R, Set<PObjectId>>();

  if (selectorRules.length > 0) {
    const baseColumns = uniqBy(columns, (col) => col.id);
    const baseCollection = ColumnsCollection([{ columns: baseColumns, isFinal: true }]);
    for (const rule of selectorRules) {
      const hitIds = baseCollection.filter({ include: rule.match }).getColumnIds();
      if (hitIds.length === 0) return result;
      selectorHitsByRule.set(rule, new Set(hitIds.map((id) => extractPObjectId(id))));
    }
  }

  for (const col of columns) {
    const colKey = extractPObjectId(col.id);
    for (const rule of rules) {
      const matches = selectorHitsByRule.get(rule)?.has(colKey) ?? false;
      if (matches) {
        result.set(colKey, rule);
        break;
      }
    }
  }
  return result;
}

/**
 * Build a sidecar map `columnId → AnnotationDataStatus` derived from each
 * recipe's own status. This is *rendering* metadata — kept out of the spec
 * so it cannot perturb column identity (id-bearing spec overrides would
 * diverge the visible PTable's column ids from the full table / pframe).
 *
 * Mapping `ColumnFieldStatus` × actual byte-presence → `AnnotationDataStatus`:
 *   - `absent`                       → `"absent"`
 *   - `resolving`                    → `"computing"`
 *   - `present` + `hasColumnData()`  → `"ready"`
 *   - `present` + no bytes yet       → `"computing"`
 *
 * Intentionally scoped to visible columns — the probe is meaningful only for
 * what the user will actually see.
 */
export function buildDataStatusMap(
  columns: ColumnRecipe[],
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): Record<ColumnUniversalId, AnnotationDataStatus> {
  return columns.reduce(
    (acc, c) => ((acc[c.id] = deriveDataStatus(c, opts)), acc),
    {} as Record<ColumnUniversalId, AnnotationDataStatus>,
  );
}

function deriveDataStatus(
  column: ColumnRecipe,
  opts: { ctx?: GlobalCfgRenderCtx },
): AnnotationDataStatus {
  const field = column.getDataStatus();
  if (field === "absent") return "absent";
  if (field === "resolving") return "computing";
  return hasColumnData(column, opts) ? "ready" : "computing";
}

/** Column shape required by label derivation. */
export type LabelableColumn = {
  readonly id: ColumnUniversalId;
  readonly spec: PColumnSpec;
  readonly linkerPath?: ReadonlyArray<{ readonly linker: { readonly spec: PColumnSpec } }>;
  readonly qualifications?: MatchQualifications;
};

/** Derive labels for all table elements: columns via deriveDistinctLabels, axes from label columns. */
export function deriveAllLabels(options: {
  columns: LabelableColumn[];
  deriveLabelsOptions?: DeriveLabelsOptions;
}): Record<string, string> {
  const { columns, deriveLabelsOptions } = options;
  const entries = columns.map((c) => ({
    spec: c.spec,
    linkerPath: c.linkerPath?.map((step) => ({ spec: step.linker.spec })),
    qualifications: c.qualifications,
  }));
  const columnLabels = deriveDistinctLabels(entries, deriveLabelsOptions).reduce(
    (acc, label, index) => ((acc[columns[index].id] = label), acc),
    {} as Record<string, string>,
  );
  return columnLabels;
}

/** Column shape required by tooltip derivation. */
export type TooltipableColumn = {
  readonly id: ColumnUniversalId;
  readonly spec: PColumnSpec;
  readonly originalId?: PObjectId;
  readonly linkerPath?: ReadonlyArray<{ readonly linker: { readonly spec: PColumnSpec } }>;
  readonly qualifications?: MatchQualifications;
};

/** Derive origin tooltips for columns whose qualifications or linker path carry info. */
export function deriveAllTooltips(options: {
  columns: TooltipableColumn[];
}): Record<ColumnUniversalId, string> {
  const { columns } = options;

  const variantCountByOriginal = columns.reduce<Map<ColumnUniversalId, number>>((acc, c) => {
    return acc.set(getField(c, "originalId") ?? c.id, (acc.get(c.originalId ?? c.id) ?? 0) + 1);
  }, new Map());

  const { entries } = columns.reduce(
    ({ entries, variantSeen }, c) => {
      const id = getField(c, "originalId") ?? c.id;
      const variantCount = variantCountByOriginal.get(id);
      const variantIndex =
        (variantSeen.set(id, (variantSeen.get(id) ?? 0) + 1), variantSeen.get(id));

      entries.push({
        spec: c.spec,
        linkerPath: c.linkerPath,
        qualifications: c.qualifications,
        variantIndex,
        variantCount,
      });

      return { entries, variantSeen };
    },
    { entries: [] as TooltipEntry[], variantSeen: new Map<ColumnUniversalId, number>() },
  );

  const tooltips = deriveDistinctTooltips(entries);

  return Object.fromEntries(
    tooltips.flatMap((t, i) => (isNil(t) ? [] : [[columns[i].id, t] as const])),
  );
}
