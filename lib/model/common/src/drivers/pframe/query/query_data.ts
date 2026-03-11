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
  TypeSpec,
  InferBooleanExpressionUnion,
} from "./query_common";

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
export interface DataQueryJoinEntry extends QueryJoinEntry<DataQuery> {
  /** Maps this entry's axes to the result axes by index */
  axesMapping: number[];
}

/** @see QueryColumn */
export type DataQueryColumn = QueryColumn;
/** @see QueryInlineColumn */
export type DataQueryInlineColumn = QueryInlineColumn<ColumnIdAndTypeSpec>;
/** @see QuerySparseToDenseColumn */
export type DataQuerySparseToDenseColumn = QuerySparseToDenseColumn<PObjectId, ColumnIdAndTypeSpec>;
/** @see QuerySymmetricJoin */
export type DataQuerySymmetricJoin = QuerySymmetricJoin<DataQueryJoinEntry>;
/** @see QueryOuterJoin */
export type DataQueryOuterJoin = QueryOuterJoin<DataQueryJoinEntry>;
/** @see QuerySliceAxes */
export type DataQuerySliceAxes = QuerySliceAxes<DataQuery, QueryAxisSelector<number>>;
/** @see QuerySort */
export type DataQuerySort = QuerySort<DataQuery, DataQueryExpression>;
/** @see QueryFilter */
export type DataQueryFilter = QueryFilter<DataQuery, DataQueryBooleanExpression>;

/**
 * Union of all data layer query types.
 *
 * The data layer operates with numeric indices for axes and columns,
 * making it suitable for runtime query execution and optimization.
 *
 * Includes:
 * - Leaf nodes: column, inlineColumn, sparseToDenseColumn
 * - Join operations: innerJoin, fullJoin, outerJoin
 * - Transformations: sliceAxes, sort, filter
 */
export type DataQuery =
  | DataQueryColumn
  | DataQueryInlineColumn
  | DataQuerySparseToDenseColumn
  | DataQuerySymmetricJoin
  | DataQueryOuterJoin
  | DataQuerySliceAxes
  | DataQuerySort
  | DataQueryFilter;

/** @see ExprAxisRef */
export type DataExprAxisRef = ExprAxisRef<number>;
/** @see ExprColumnRef */
export type DataExprColumnRef = ExprColumnRef<number>;

export type DataQueryExpression =
  | DataExprColumnRef
  | DataExprAxisRef
  | ExprConstant
  | ExprNumericBinary<DataQueryExpression>
  | ExprNumericComparison<DataQueryExpression>
  | ExprNumericUnary<DataQueryExpression>
  | ExprStringEquals<DataQueryExpression>
  | ExprStringContains<DataQueryExpression>
  | ExprStringRegex<DataQueryExpression>
  | ExprStringContainsFuzzy<DataQueryExpression>
  | ExprIsNull<DataQueryExpression>
  | ExprIfNull<DataQueryExpression>
  | ExprLogicalUnary<DataQueryExpression>
  | ExprLogicalVariadic<DataQueryExpression>
  | ExprIsIn<DataQueryExpression, string>
  | ExprIsIn<DataQueryExpression, number>;

export type DataQueryBooleanExpression = InferBooleanExpressionUnion<DataQueryExpression>;
