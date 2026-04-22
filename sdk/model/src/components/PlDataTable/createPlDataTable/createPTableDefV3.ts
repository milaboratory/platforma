import type {
  AxisQualification,
  PColumn,
  PTableColumnId,
  PTableSorting,
  PTableDefV2,
  SingleAxisSelector,
  SpecQuery,
  SpecQueryExpression,
  SpecQueryJoinEntry,
  PObjectId,
} from "@milaboratories/pl-model-common";
import { isBooleanExpression } from "@milaboratories/pl-model-common";
import type { PColumnDataUniversal } from "../../../render";
import { isNil } from "es-toolkit";
import type { PlDataTableFilters } from "../typesV5";
import { distillFilterSpec, filterSpecToSpecQueryExpr } from "../../../filters";
import type { Nil } from "@milaboratories/helpers";

/** Primary side — base row grid. `key` links secondary groups to their qualifying anchor. */
export type PrimaryEntry<Data> = {
  column: PColumn<Data>;
};

/** Secondary side leaf — the hit column, a linker step, or a label column. */
export type SecondaryEntry<Data> = {
  column: PColumn<Data>;
  /** For hit: `forHit`. For linker step k: `path[k].qualifications`. For label/direct: omit. */
  qualifications?: AxisQualification[];
};

/** Secondary group — one join subtree outer-joined onto primary. */
export type SecondaryGroup<Data> = {
  entries: SecondaryEntry<Data>[];
  /** Per-variant qualifications applied to the cloned primary anchors on this group's side.
   *  Keyed by `PrimaryEntry.anchorName`. Omit → base primary used unqualified (labels, non-variant columns). */
  primaryQualifications?: Record<PObjectId, AxisQualification[]>;
};

export function createPTableDefV3<Data = PColumnDataUniversal>(params: {
  primaryJoinType: "inner" | "full";
  primary: PrimaryEntry<Data>[];
  secondary: SecondaryGroup<Data>[];
  filters?: Nil | PlDataTableFilters;
  sorting?: Nil | PTableSorting[];
}): PTableDefV2<PColumn<Data>> {
  let query: SpecQuery<PColumn<Data>> = {
    type: params.primaryJoinType === "inner" ? "innerJoin" : "fullJoin",
    entries: params.primary.map((a) => toLeaf(a.column, [])),
  };

  for (const group of params.secondary) {
    query = {
      type: "outerJoin",
      primary: {
        entry: query,
        qualifications: params.primary.flatMap((p) => {
          return group.primaryQualifications?.[p.column.id] ?? [];
        }),
      },
      secondary: group.entries.map((e) => toLeaf(e.column, e.qualifications ?? [])),
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
        nullsFirst: !s.naAndAbsentAreLeastValues,
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

function toLeaf<Data>(
  col: PColumn<Data>,
  qs: AxisQualification[],
): SpecQueryJoinEntry<PColumn<Data>> {
  return {
    entry: { type: "column", column: col },
    qualifications: qs,
  };
}
