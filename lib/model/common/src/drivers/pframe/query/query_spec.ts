import type { PObjectId } from "../../../pool";
import type { ColumnUniversalId } from "../spec/ids";
import type {
  ExprAxisRef,
  ExprCast,
  ExprColumnRef,
  ExprConditional,
  ExprConstant,
  ExprFillNull,
  ExprIsIn,
  ExprIsNull,
  ExprLogicalUnary,
  ExprLogicalVariadic,
  ExprNumericBinary,
  ExprNumericComparison,
  ExprNumericUnary,
  ExprRanking,
  ExprStringContains,
  ExprStringContainsFuzzy,
  ExprStringEquals,
  ExprStringRegex,
  InferBooleanExpressionUnion,
  QueryColumn,
  QueryFilter,
  QueryInlineColumn,
  QueryJoinEntry,
  QueryLinkerJoin,
  QueryOuterJoin,
  QuerySliceAxes,
  QuerySort,
  QuerySparseToDenseColumn,
  QuerySpecOverride,
  QuerySymmetricJoin,
  QueryTransformColumns,
} from "./query_common";
import type { Domain, PColumnIdAndSpec, SingleAxisSelector } from "../spec";
import type { SpecOverrides } from "../spec/overridden";

/**
 * Join entry for spec-layer queries — the base join entry extended with
 * per-axis domain constraints. Absent `qualifications` is equivalent to `[]`.
 *
 * @example
 * {
 *   entry: querySpec,
 *   qualifications: [{ axis: { name: 'sample' }, contextDomain: { ... } }]
 * }
 */
export type SpecQueryJoinEntry<C = ColumnUniversalId> = QueryJoinEntry<SpecQuery<C>> & {
  qualifications?: readonly {
    /** Axis to qualify. */
    axis: SingleAxisSelector;
    /** Additional domain constraints for this axis. */
    contextDomain: Domain;
  }[];
};

/** @see QueryColumn */
export type SpecQueryColumn<C = ColumnUniversalId> = QueryColumn<C>;
/** @see QueryInlineColumn */
export type SpecQueryInlineColumn = QueryInlineColumn<PColumnIdAndSpec>;
/** @see QuerySparseToDenseColumn */
export type SpecQuerySparseToDenseColumn<C = ColumnUniversalId> = QuerySparseToDenseColumn<
  C,
  SingleAxisSelector,
  PColumnIdAndSpec
>;
/** @see QuerySymmetricJoin */
export type SpecQuerySymmetricJoin<C = ColumnUniversalId> = QuerySymmetricJoin<
  SpecQueryJoinEntry<C>
>;
/** @see QueryOuterJoin */
export type SpecQueryOuterJoin<C = ColumnUniversalId> = QueryOuterJoin<SpecQueryJoinEntry<C>>;
/** @see QueryLinkerJoin */
export type SpecQueryLinkerJoin<C = ColumnUniversalId> = QueryLinkerJoin<
  SpecQuery<C>,
  SpecQueryJoinEntry<C>
>;
/** @see QuerySliceAxes */
export type SpecQuerySliceAxes<C = ColumnUniversalId> = QuerySliceAxes<
  SpecQuery<C>,
  SingleAxisSelector
>;
/** @see QuerySort */
export type SpecQuerySort<C = ColumnUniversalId> = QuerySort<SpecQuery<C>, SpecQueryExpression>;
/** @see QueryFilter */
export type SpecQueryFilter<C = ColumnUniversalId> = QueryFilter<
  SpecQuery<C>,
  SpecQueryBooleanExpression
>;
/** @see QueryTransformColumns */
export type SpecQueryTransformColumns<C = ColumnUniversalId> = QueryTransformColumns<
  SpecQuery<C>,
  SpecQueryExpression,
  PColumnIdAndSpec
>;
/**
 * Client-side spec-override node — collapsed at the host boundary, never
 * sent to pframe-engine.
 *
 * @see QuerySpecOverride
 */
export type SpecQuerySpecOverride<C = ColumnUniversalId> = QuerySpecOverride<
  SpecQuery<C>,
  SpecOverrides
>;

/**
 * Union of all spec layer query types.
 *
 * The spec layer operates with named selectors and column IDs,
 * making it suitable for user-facing query construction and validation.
 *
 * @template C - Column reference type. Defaults to PObjectId (ID-only).
 *   Can be parameterized with richer types (e.g., PColumn<Data>) to carry
 *   full column data directly in the query tree.
 *
 * Includes:
 * - Leaf nodes: column, inlineColumn, sparseToDenseColumn
 * - Join operations: innerJoin, fullJoin, outerJoin, linkerJoin
 * - Transformations: sliceAxes, sort, filter, transformColumns
 * - Client-side overlays: specOverride (collapsed before reaching the engine)
 */
export type SpecQuery<C = ColumnUniversalId> =
  | SpecQueryColumn<C>
  | SpecQueryInlineColumn
  | SpecQuerySparseToDenseColumn<C>
  | SpecQuerySymmetricJoin<C>
  | SpecQueryOuterJoin<C>
  | SpecQueryLinkerJoin<C>
  | SpecQuerySliceAxes<C>
  | SpecQuerySort<C>
  | SpecQueryFilter<C>
  | SpecQueryTransformColumns<C>
  | SpecQuerySpecOverride<C>;

/** @see ExprAxisRef */
export type SpecExprAxisRef = ExprAxisRef<SingleAxisSelector>;
/** @see ExprColumnRef */
export type SpecExprColumnRef = ExprColumnRef<ColumnUniversalId>;

export type SpecQueryExpression =
  | SpecExprColumnRef
  | SpecExprAxisRef
  | ExprConstant
  | ExprNumericBinary<SpecQueryExpression>
  | ExprNumericComparison<SpecQueryExpression>
  | ExprNumericUnary<SpecQueryExpression>
  | ExprStringEquals<SpecQueryExpression>
  | ExprStringContains<SpecQueryExpression>
  | ExprStringRegex<SpecQueryExpression>
  | ExprStringContainsFuzzy<SpecQueryExpression>
  | ExprIsNull<SpecQueryExpression>
  | ExprFillNull<SpecQueryExpression>
  | ExprLogicalUnary<SpecQueryExpression>
  | ExprLogicalVariadic<SpecQueryExpression>
  | ExprIsIn<SpecQueryExpression, string>
  | ExprIsIn<SpecQueryExpression, number>
  // | ExprIsInPolygon<SpecQueryExpression>  -- runtime not wired (see query_common.ts)
  | ExprCast<SpecQueryExpression>
  | ExprConditional<SpecQueryExpression>
  // | ExprAggregation<SpecQueryExpression, SingleAxisSelector, PObjectId>  -- runtime not wired
  | ExprRanking<SpecQueryExpression, SingleAxisSelector, PObjectId>;
// | ExprCumulative<SpecQueryExpression, SingleAxisSelector, PObjectId>  -- runtime not wired

export type SpecQueryBooleanExpression = InferBooleanExpressionUnion<SpecQueryExpression>;
