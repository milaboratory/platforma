import type { AxisSpec, PObjectId, PTableColumnId, PTableColumnSpec } from "@platforma-sdk/model";
import { canonicalizeAxisId, extractPObjectId, getAxisId } from "@platforma-sdk/model";
import type { SupportedFilterTypes } from "../PlAdvancedFilter/types";

/** Predicates the table filter offers (same set as FilterSidebar, plus list membership). */
export const TABLE_FILTER_TYPES: SupportedFilterTypes[] = [
  "isNA",
  "isNotNA",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "patternEquals",
  "patternNotEquals",
  "patternContainSubsequence",
  "patternNotContainSubsequence",
  "patternMatchesRegularExpression",
  "patternFuzzyContainSubsequence",
  "equal",
  "notEqual",
  "inSet",
  "notInSet",
];

/** Where value suggestions for a filtered table column come from. */
export type SuggestSource =
  | { type: "column"; columnId: PObjectId; axisIdx: undefined | number }
  | { type: "axis"; axisSpec: AxisSpec; parentColumnIds: PObjectId[] };

/**
 * A data column suggests its own values. An axis suggests the keys of every
 * table column carrying it: a full join can hold keys that only some of those
 * columns have, and the user can filter by any of them.
 */
export function resolveSuggestSource(
  columns: PTableColumnSpec[],
  tableColumnId: PTableColumnId,
  axisIdx: undefined | number,
): SuggestSource {
  if (tableColumnId.type === "column") {
    return { type: "column", columnId: extractPObjectId(tableColumnId.id), axisIdx };
  }

  const strAxisId = canonicalizeAxisId(tableColumnId.id);
  let axisSpec: undefined | AxisSpec;
  const parentColumnIds = new Set<PObjectId>();
  for (const col of columns) {
    if (col.type === "axis") {
      if (canonicalizeAxisId(col.id) === strAxisId) axisSpec = col.spec;
    } else if (carriesAxis(col.spec.axesSpec, strAxisId)) {
      parentColumnIds.add(extractPObjectId(col.id));
    }
  }
  if (axisSpec === undefined || parentColumnIds.size === 0) {
    throw new Error(
      `No column in the table carries axis ${tableColumnId.id.name}, cannot fetch suggest options`,
    );
  }
  return { type: "axis", axisSpec, parentColumnIds: [...parentColumnIds] };
}

// Internals

function carriesAxis(axesSpec: AxisSpec[], strAxisId: string): boolean {
  return axesSpec.some((axis) => canonicalizeAxisId(getAxisId(axis)) === strAxisId);
}
