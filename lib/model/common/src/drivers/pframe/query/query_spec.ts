import type { PObjectId } from '../../../pool';
import type {
  ExprAxisRef,
  ExprColumnRef,
  ExprNumericBinary,
  ExprConstant,
  ExprIsIn,
  ExprLogicalUnary,
  ExprLogicalVariadic,
  ExprStringContains,
  ExprStringContainsFuzzy,
  ExprStringEquals,
  ExprStringRegex,
  ExprNumericUnary,
  QueryAxisSelector,
  QueryColumn, QueryCrossJoinColumn,
  QueryFilter,
  QueryInlineColumn,
  QueryJoinEntry,
  QueryOuterJoin,
  QuerySliceAxes,
  QuerySort,
  QuerySymmetricJoin,
  InferBooleanExpressionUnion,
} from './query_common';
import type { Domain, PColumnIdAndSpec, PColumnSpec, SingleAxisSelector } from '../spec';

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
export type QueryJoinEntrySpec = QueryJoinEntry<QuerySpec> & {
  /** Axis qualifications with additional domain constraints */
  qualifications: {
    /** Axis selector identifying which axis to qualify */
    axis: SingleAxisSelector;
    /** Additional domain constraints for this axis */
    additionalDomains: Domain;
  }[];
};

/** @see QueryColumn */
export type QueryColumnSpec = QueryColumn;
/** @see QueryInlineColumn */
export type QueryInlineColumnSpec = QueryInlineColumn<ColumnIdAndSpec>;
/** @see QueryCrossJoinColumn */
export type QueryCrossJoinColumnSpec = QueryCrossJoinColumn<PColumnIdAndSpec>;
/** @see QuerySymmetricJoin */
export type QuerySymmetricJoinSpec = QuerySymmetricJoin<QueryJoinEntrySpec>;
/** @see QueryOuterJoin */
export type QueryOuterJoinSpec = QueryOuterJoin<QueryJoinEntrySpec>;
/** @see QuerySliceAxes */
export type QuerySliceAxesSpec = QuerySliceAxes<QuerySpec, QueryAxisSelector<SingleAxisSelector>>;
/** @see QuerySort */
export type QuerySortSpec = QuerySort<QuerySpec, QueryExpressionSpec>;
/** @see QueryFilter */
export type QueryFilterSpec = QueryFilter<QuerySpec, QueryBooleanExpressionSpec>;

/**
 * Union of all spec layer query types.
 *
 * The spec layer operates with named selectors and column IDs,
 * making it suitable for user-facing query construction and validation.
 *
 * Includes:
 * - Leaf nodes: column, inlineColumn, crossJoinColumn
 * - Join operations: innerJoin, fullJoin, outerJoin
 * - Transformations: sliceAxes, sort, filter
 */
export type QuerySpec =
  | QueryColumnSpec
  | QueryInlineColumnSpec
  | QueryCrossJoinColumnSpec
  | QuerySymmetricJoinSpec
  | QueryOuterJoinSpec
  | QuerySliceAxesSpec
  | QuerySortSpec
  | QueryFilterSpec;

/** @see ExprAxisRef */
export type ExprAxisRefSpec = ExprAxisRef<SingleAxisSelector>;
/** @see ExprColumnRef */
export type ExprColumnRefSpec = ExprColumnRef<PObjectId>;

export type QueryExpressionSpec =
  | ExprColumnRefSpec | ExprAxisRefSpec | ExprConstant
  | ExprNumericBinary<QueryExpressionSpec> | ExprNumericUnary<QueryExpressionSpec>
  | ExprStringEquals<QueryExpressionSpec> | ExprStringContains<QueryExpressionSpec>
  | ExprStringRegex<QueryExpressionSpec> | ExprStringContainsFuzzy<QueryExpressionSpec>
  | ExprLogicalUnary<QueryExpressionSpec> | ExprLogicalVariadic<QueryExpressionSpec>
  | ExprIsIn<QueryExpressionSpec, string> | ExprIsIn<QueryExpressionSpec, number>;

export type QueryBooleanExpressionSpec = InferBooleanExpressionUnion<QueryExpressionSpec>;
