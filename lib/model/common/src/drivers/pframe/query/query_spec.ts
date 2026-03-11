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
export type SpecQueryJoinEntry<C = PObjectId> = QueryJoinEntry<SpecQuery<C>> & {
  /** Axis qualifications with additional domain constraints */
  qualifications: {
    /** Axis selector identifying which axis to qualify */
    axis: SingleAxisSelector;
    /** Additional domain constraints for this axis */
    additionalDomains: Domain;
  }[];
};

/** @see QueryColumn */
export type SpecQueryColumn<C = PObjectId> = QueryColumn<C>;
/** @see QueryInlineColumn */
export type SpecQueryInlineColumn = QueryInlineColumn<ColumnIdAndSpec>;
/** @see QuerySparseToDenseColumn */
export type SpecQuerySparseToDenseColumn<C = PObjectId> = QuerySparseToDenseColumn<
  C,
  PColumnIdAndSpec
>;
/** @see QuerySymmetricJoin */
export type SpecQuerySymmetricJoin<C = PObjectId> = QuerySymmetricJoin<SpecQueryJoinEntry<C>>;
/** @see QueryOuterJoin */
export type SpecQueryOuterJoin<C = PObjectId> = QueryOuterJoin<SpecQueryJoinEntry<C>>;
/** @see QuerySliceAxes */
export type SpecQuerySliceAxes<C = PObjectId> = QuerySliceAxes<
  SpecQuery<C>,
  QueryAxisSelector<SingleAxisSelector>
>;
/** @see QuerySort */
export type SpecQuerySort<C = PObjectId> = QuerySort<SpecQuery<C>, SpecQueryExpression>;
/** @see QueryFilter */
export type SpecQueryFilter<C = PObjectId> = QueryFilter<SpecQuery<C>, SpecQueryBooleanExpression>;

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
export type SpecQuery<C = PObjectId> =
  | SpecQueryColumn<C>
  | SpecQueryInlineColumn
  | SpecQuerySparseToDenseColumn<C>
  | SpecQuerySymmetricJoin<C>
  | SpecQueryOuterJoin<C>
  | SpecQuerySliceAxes<C>
  | SpecQuerySort<C>
  | SpecQueryFilter<C>;

/** @see ExprAxisRef */
export type SpecExprAxisRef = ExprAxisRef<SingleAxisSelector>;
/** @see ExprColumnRef */
export type SpecExprColumnRef = ExprColumnRef<PObjectId>;

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
  | ExprIfNull<SpecQueryExpression>
  | ExprLogicalUnary<SpecQueryExpression>
  | ExprLogicalVariadic<SpecQueryExpression>
  | ExprIsIn<SpecQueryExpression, string>
  | ExprIsIn<SpecQueryExpression, number>;

export type SpecQueryBooleanExpression = InferBooleanExpressionUnion<SpecQueryExpression>;
