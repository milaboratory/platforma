import type {
  PColumn,
  PTableColumnId,
  PTableSorting,
  PTableDefV2,
  SingleAxisSelector,
  SpecQuery,
  SpecQueryExpression,
  SpecQueryJoinEntry,
} from "@milaboratories/pl-model-common";
import { isBooleanExpression } from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal } from "../../../render";
import { isNil } from "es-toolkit";
import type { PlDataTableFilters } from "../typesV5";
import { distillFilterSpec, filterSpecToSpecQueryExpr } from "../../../filters";
import type { Nil } from "@milaboratories/helpers";

export function createPTableDefV3<Data = PColumnDataUniversal>(params: {
  coreJoinType: "inner" | "full";
  coreColumns: PColumn<Data>[];
  secondaryColumns: PColumn<Data>[];
  filters?: Nil | PlDataTableFilters;
  sorting?: Nil | PTableSorting[];
}): PTableDefV2<PColumn<Data>> {
  // Build SpecQuery directly from columns
  const coreJoinQuery: SpecQuery<PColumn<Data>> = {
    type: params.coreJoinType === "inner" ? "innerJoin" : "fullJoin",
    entries: params.coreColumns.map((c) => toJoinEntry({ type: "column", column: c })),
  };

  let query: SpecQuery<PColumn<Data>> = {
    type: "outerJoin",
    primary: toJoinEntry(coreJoinQuery),
    secondary: params.secondaryColumns.map((c) => toJoinEntry({ type: "column", column: c })),
  };

  // Apply filters
  if (!isNil(params.filters)) {
    const nonEmpty = distillFilterSpec(params.filters);

    if (!isNil(nonEmpty)) {
      const pridicate = filterSpecToSpecQueryExpr(nonEmpty);
      if (!isBooleanExpression(pridicate)) {
        throw new Error(
          `Filter conversion produced a non-boolean expression (got type "${pridicate.type}"), expected a boolean predicate for query filtering`,
        );
      }
      query = {
        type: "filter",
        input: query,
        predicate: pridicate,
      };
    }
  }

  // Apply sorting
  if (!isNil(params.sorting) && params.sorting.length > 0) {
    query = {
      type: "sort",
      input: query,
      sortBy: params.sorting.map((s) => ({
        expression: columnIdToExpr(s.column),
        ascending: s.ascending,
        nullsFirst: !s.naAndAbsentAreLeastValues,
      })),
    };
  }

  return { query };
}

/** Convert a PTableColumnId to a SpecQueryExpression reference. */
function columnIdToExpr(col: PTableColumnId): SpecQueryExpression {
  if (col.type === "axis") {
    return { type: "axisRef", value: col.id as SingleAxisSelector };
  }
  return { type: "columnRef", value: col.id };
}

function toJoinEntry<C>(input: SpecQuery<C>): SpecQueryJoinEntry<C> {
  return {
    entry: input,
    qualifications: [],
  };
}
