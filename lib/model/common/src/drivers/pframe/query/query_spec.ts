import type { PObjectId } from "../../../pool";
import type {
  ExprAxisRef,
  ExprColumnRef,
  ExprNumericBinary,
  ExprNumericComparison,
  ExprConstant,
  ExprIsIn,
  ExprIsNull,
  ExprIfNull,
  ExprLogicalUnary,
  ExprLogicalVariadic,
  ExprStringContains,
  ExprStringContainsFuzzy,
  ExprStringEquals,
  ExprStringRegex,
  ExprNumericUnary,
  QueryAxisSelector,
  QueryColumn,
  QuerySparseToDenseColumn,
  QueryFilter,
  QueryInlineColumn,
  QueryJoinEntry,
  QueryOuterJoin,
  QuerySliceAxes,
  QuerySort,
  QuerySymmetricJoin,
  InferBooleanExpressionUnion,
} from "./query_common";
import type { Domain, PColumnIdAndSpec, PColumnSpec, SingleAxisSelector } from "../spec";

/**
 * Column identifier with specification.
 *
 * Pairs a column ID with its full PColumnSpec.
 * Used in spec layer to carry column specification alongside references.
 */
type ColumnIdAndSpec = {
  /** Unique identifier of the column */
  id: PObjectId;
  /** Full column specification including axes and value type */
  spec: PColumnSpec;
};

/**
 * Join entry for spec layer queries.
 *
 * Extends the base join entry with axis qualifications.
 * Qualifications specify additional domain constraints for each axis,
 * enabling more precise control over how columns are joined.
 *
 * @example
 * // Join entry with axis qualifications
 * {
 *   entry: querySpec,
 *   qualifications: [
 *     { axis: { name: 'sample' }, additionalDomains: { ... } }
 *   ]
 * }
 */
export type QueryJoinEntrySpec<C = PObjectId> = QueryJoinEntry<QuerySpec<C>> & {
  /** Axis qualifications with additional domain constraints */
  qualifications: {
    /** Axis selector identifying which axis to qualify */
    axis: SingleAxisSelector;
    /** Additional domain constraints for this axis */
    additionalDomains: Domain;
  }[];
};

/** @see QueryColumn */
export type QueryColumnSpec<C = PObjectId> = QueryColumn<C>;
/** @see QueryInlineColumn */
export type QueryInlineColumnSpec = QueryInlineColumn<ColumnIdAndSpec>;
/** @see QuerySparseToDenseColumn */
export type QuerySparseToDenseColumnSpec<C = PObjectId> = QuerySparseToDenseColumn<
  C,
  PColumnIdAndSpec
>;
/** @see QuerySymmetricJoin */
export type QuerySymmetricJoinSpec<C = PObjectId> = QuerySymmetricJoin<QueryJoinEntrySpec<C>>;
/** @see QueryOuterJoin */
export type QueryOuterJoinSpec<C = PObjectId> = QueryOuterJoin<QueryJoinEntrySpec<C>>;
/** @see QuerySliceAxes */
export type QuerySliceAxesSpec<C = PObjectId> = QuerySliceAxes<
  QuerySpec<C>,
  QueryAxisSelector<SingleAxisSelector>
>;
/** @see QuerySort */
export type QuerySortSpec<C = PObjectId> = QuerySort<QuerySpec<C>, QueryExpressionSpec>;
/** @see QueryFilter */
export type QueryFilterSpec<C = PObjectId> = QueryFilter<QuerySpec<C>, QueryBooleanExpressionSpec>;

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
 * - Join operations: innerJoin, fullJoin, outerJoin
 * - Transformations: sliceAxes, sort, filter
 */
export type QuerySpec<C = PObjectId> =
  | QueryColumnSpec<C>
  | QueryInlineColumnSpec
  | QuerySparseToDenseColumnSpec<C>
  | QuerySymmetricJoinSpec<C>
  | QueryOuterJoinSpec<C>
  | QuerySliceAxesSpec<C>
  | QuerySortSpec<C>
  | QueryFilterSpec<C>;

/** @see ExprAxisRef */
export type ExprAxisRefSpec = ExprAxisRef<SingleAxisSelector>;
/** @see ExprColumnRef */
export type ExprColumnRefSpec = ExprColumnRef<PObjectId>;

export type QueryExpressionSpec =
  | ExprColumnRefSpec
  | ExprAxisRefSpec
  | ExprConstant
  | ExprNumericBinary<QueryExpressionSpec>
  | ExprNumericComparison<QueryExpressionSpec>
  | ExprNumericUnary<QueryExpressionSpec>
  | ExprStringEquals<QueryExpressionSpec>
  | ExprStringContains<QueryExpressionSpec>
  | ExprStringRegex<QueryExpressionSpec>
  | ExprStringContainsFuzzy<QueryExpressionSpec>
  | ExprIsNull<QueryExpressionSpec>
  | ExprIfNull<QueryExpressionSpec>
  | ExprLogicalUnary<QueryExpressionSpec>
  | ExprLogicalVariadic<QueryExpressionSpec>
  | ExprIsIn<QueryExpressionSpec, string>
  | ExprIsIn<QueryExpressionSpec, number>;

export type QueryBooleanExpressionSpec = InferBooleanExpressionUnion<QueryExpressionSpec>;
