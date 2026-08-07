import type {
  DataQueryBooleanExpression,
  PTableColumnSpec,
  PTableRecordFilter,
} from "@milaboratories/pl-model-common";
import { spec as bindings } from "./generated/pframes_rs_wasip2.js";

/**
 * Upgrades the selector-based legacy record filters into index-based boolean
 * expressions for the data layer. It resolves them against the given unified
 * table spec, which holds the axes first and then the columns.
 *
 * The operation is stateless, because a filter does not change the spec of a
 * table. Therefore the result is valid for `getUniqueValues`, which works on
 * the single-column table of the source column. The result is also valid when
 * you compose a `filter` over a `table` query node.
 */
export function rewriteLegacyFilters(request: {
  tableSpec: PTableColumnSpec[];
  filters: PTableRecordFilter[];
}): DataQueryBooleanExpression[] {
  return JSON.parse(bindings.Frame.rewriteLegacyFilters(JSON.stringify(request)));
}
