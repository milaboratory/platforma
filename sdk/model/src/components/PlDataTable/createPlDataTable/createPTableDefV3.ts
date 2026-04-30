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

/** Primary side — base row grid. */
export type PrimaryEntry<Data> = {
  column: PColumn<Data>;
};

/** Secondary side leaf — the hit column, a linker step, or a label column. */
export type SecondaryEntry<Data> = {
  column: PColumn<Data>;
  /** For hit: `forHit`. For label/direct: omit. */
  qualifications?: AxisQualification[];
};

/**
 * Secondary group — one outerJoin secondary subtree.
 *
 * For direct hits `linkers` is omitted/empty and the group becomes a plain
 * column leaf. For linked hits the chain is right-folded into nested
 * `linkerJoin` operations (outermost-first), binding *this* hit to *this*
 * linker chain so the engine cannot collapse variants whose intermediate
 * axes share name + domain.
 */
export type SecondaryGroup<Data> = {
  hit: SecondaryEntry<Data>;
  /** Outermost-first linker chain. Omit for direct hits. */
  linkers?: { column: PColumn<Data> }[];
  /** Per-variant qualifications applied to the cloned primary anchors on this group's side.
   *  Keyed by `PrimaryEntry.column.id`. Omit → base primary used unqualified (labels, non-variant columns). */
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

  if (params.secondary.length > 0) {
    query = {
      type: "outerJoin",
      primary: {
        entry: query,
        qualifications: params.secondary.flatMap((g) =>
          params.primary.flatMap((p) => g.primaryQualifications?.[p.column.id] ?? []),
        ),
      },
      secondary: params.secondary.map(toSecondaryEntry),
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

function toSecondaryEntry<Data>(group: SecondaryGroup<Data>): SpecQueryJoinEntry<PColumn<Data>> {
  const hitEntry = toLeaf(group.hit.column, group.hit.qualifications ?? []);
  if (isNil(group.linkers) || group.linkers.length === 0) return hitEntry;
  return group.linkers.reduceRight<SpecQueryJoinEntry<PColumn<Data>>>(
    (inner, linker) => ({
      entry: {
        type: "linkerJoin",
        linker: { column: linker.column },
        secondary: [inner],
      },
      qualifications: [],
    }),
    hitEntry,
  );
}
