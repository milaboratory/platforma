import type {
  AxisQualification,
  ColumnUniversalId,
  PObjectId,
  PTableColumnId,
  PTableSorting,
  PTableDefV2,
  SingleAxisSelector,
  SpecQuery,
  SpecQueryExpression,
  SpecQueryJoinEntry,
} from "@milaboratories/pl-model-common";
import { isBooleanExpression } from "@milaboratories/pl-model-common";
import { isNil } from "es-toolkit";
import type { PlDataTableFilters } from "../typesV8";
import { distillFilterSpec, filterSpecToSpecQueryExpr } from "../../../filters";
import type { Nil } from "@milaboratories/helpers";
import type { ColumnRecipe } from "../../..";
import { hitQualifications, queriesQualifications } from "../../../columns";

/**
 * Assemble a ptable def directly from recipes. Each secondary recipe is its own
 * outer-joined subtree: `getQuery()` encodes its linker chain, and its
 * hit-/queries-qualifications are derived on the spot via {@link hitQualifications}
 * / {@link queriesQualifications} — no pre-extracted DTO. Bare leaves yield empty
 * qualifications, so plain {@link ColumnRecipe} arrays (e.g. label columns) work
 * unchanged.
 */
export function createPTableDefV3(params: {
  primaryJoinType: "inner" | "full";
  primary: ColumnRecipe[];
  secondary: ColumnRecipe[];
  filters?: Nil | PlDataTableFilters;
  sorting?: Nil | PTableSorting[];
}): PTableDefV2<ColumnUniversalId> {
  let query: SpecQuery = {
    type: params.primaryJoinType === "inner" ? "innerJoin" : "fullJoin",
    entries: params.primary.map((c) => columnToJoinEntry(c, [])),
  };

  if (params.secondary.length > 0) {
    query = {
      type: "outerJoin",
      primary: {
        entry: query,
        qualifications: params.secondary.flatMap((s) => {
          const quals = queriesQualifications(s);
          return params.primary.flatMap((p) => quals[p.id as PObjectId] ?? []);
        }),
      },
      secondary: params.secondary.map((c) => columnToJoinEntry(c, hitQualifications(c))),
    };
  }

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

  if (!isNil(params.sorting) && params.sorting.length > 0) {
    query = {
      type: "sort",
      input: query,
      sortBy: params.sorting.map((s) => ({
        expression: columnIdToExpr(s.column),
        ascending: s.ascending,
        nullsFirst: s.naAndAbsentAreLeastValues,
      })),
    };
  }

  return { query };
}

function columnIdToExpr(col: PTableColumnId): SpecQueryExpression {
  return col.type === "axis"
    ? { type: "axisRef", value: col.id as SingleAxisSelector }
    : { type: "columnRef", value: col.id };
}

function columnToJoinEntry(
  col: ColumnRecipe,
  qualifications: readonly AxisQualification[],
): SpecQueryJoinEntry {
  return {
    entry: col.getQuery(),
    qualifications,
  };
}
