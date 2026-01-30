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
  TypeSpec,
  InferBooleanExpressionUnion,
} from './query_common';

/**
 * Column identifier with type specification.
 *
 * Pairs a column ID with its full type specification (axes and column types).
 * Used in data layer to carry type information alongside column references.
 */
type ColumnIdAndTypeSpec = {
  /** Unique identifier of the column */
  id: PObjectId;
  /** Type specification defining axes and column types */
  typeSpec: TypeSpec;
};

/**
 * Join entry for data layer queries.
 *
 * Extends the base join entry with axes mapping information.
 * The mapping specifies how axes from this entry align with the joined result.
 *
 * @example
 * // Join entry with axes mapping [0, 2] means:
 * // - This entry's axis 0 maps to result axis 0
 * // - This entry's axis 1 maps to result axis 2
 * { entry: queryData, axesMapping: [0, 2] }
 */
export interface QueryJoinEntryData extends QueryJoinEntry<QueryData> {
  /** Maps this entry's axes to the result axes by index */
  axesMapping: number[];
}

/** @see QueryColumn */
export type QueryColumnData = QueryColumn;
/** @see QueryInlineColumn */
export type QueryInlineColumnData = QueryInlineColumn<ColumnIdAndTypeSpec>;
/** @see QueryCrossJoinColumn */
export type QueryCrossJoinColumnData = QueryCrossJoinColumn<ColumnIdAndTypeSpec>;
/** @see QuerySymmetricJoin */
export type QuerySymmetricJoinData = QuerySymmetricJoin<QueryJoinEntryData>;
/** @see QueryOuterJoin */
export type QueryOuterJoinData = QueryOuterJoin<QueryJoinEntryData>;
/** @see QuerySliceAxes */
export type QuerySliceAxesData = QuerySliceAxes<QueryData, QueryAxisSelector<number>>;
/** @see QuerySort */
export type QuerySortData = QuerySort<QueryData, QueryExpressionData>;
/** @see QueryFilter */
export type QueryFilterData = QueryFilter<QueryData, QueryBooleanExpressionData>;

/**
 * Union of all data layer query types.
 *
 * The data layer operates with numeric indices for axes and columns,
 * making it suitable for runtime query execution and optimization.
 *
 * Includes:
 * - Leaf nodes: column, inlineColumn, crossJoinColumn
 * - Join operations: innerJoin, fullJoin, outerJoin
 * - Transformations: sliceAxes, sort, filter
 */
export type QueryData =
  | QueryColumnData
  | QueryInlineColumnData
  | QueryCrossJoinColumnData
  | QuerySymmetricJoinData
  | QueryOuterJoinData
  | QuerySliceAxesData
  | QuerySortData
  | QueryFilterData;

/** @see ExprAxisRef */
export type ExprAxisRefData = ExprAxisRef<number>;
/** @see ExprColumnRef */
export type ExprColumnRefData = ExprColumnRef<number>;

export type QueryExpressionData =
  | ExprColumnRefData | ExprAxisRefData | ExprConstant
  | ExprNumericBinary<QueryExpressionData> | ExprNumericUnary<QueryExpressionData>
  | ExprStringEquals<QueryExpressionData> | ExprStringContains<QueryExpressionData>
  | ExprStringRegex<QueryExpressionData> | ExprStringContainsFuzzy<QueryExpressionData>
  | ExprLogicalUnary<QueryExpressionData> | ExprLogicalVariadic<QueryExpressionData>
  | ExprIsIn<QueryExpressionData, string> | ExprIsIn<QueryExpressionData, number>
  ;

export type QueryBooleanExpressionData = InferBooleanExpressionUnion<QueryExpressionData>;
