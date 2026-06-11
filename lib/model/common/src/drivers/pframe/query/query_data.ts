import type { PObjectId } from "../../../pool";
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
  QuerySymmetricJoin,
  QueryTransformColumns,
  ColumnTypeSpec,
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
  /** Type specification defining the axes and the single column value type */
  spec: ColumnTypeSpec;
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
export type DataQuerySparseToDenseColumn = QuerySparseToDenseColumn<
  PObjectId,
  number,
  ColumnIdAndTypeSpec
>;
/** @see QuerySymmetricJoin */
export type DataQuerySymmetricJoin = QuerySymmetricJoin<DataQueryJoinEntry>;
/** @see QueryOuterJoin */
export type DataQueryOuterJoin = QueryOuterJoin<DataQueryJoinEntry>;
/**
 * Linker side of a data-layer linker-join.
 *
 * Carries the linker column id along with integration-derived artifacts needed
 * for execution:
 * - `axesMapping` — how the linker's axes map into the joined result
 * - `oneSideAxesIndices` — which axis indices in the joined result to project out
 */
export type DataQueryLinkerJoinLinker = {
  /** Linker column reference. */
  column: PObjectId;
  /** Linker's axes mapped into the joined result. */
  axesMapping: number[];
  /** Axis indices (in the joined result) to project out — the linker's one-side axes. */
  oneSideAxesIndices: number[];
};
/** @see QueryLinkerJoin */
export type DataQueryLinkerJoin = QueryLinkerJoin<DataQueryLinkerJoinLinker, DataQueryJoinEntry>;
/** @see QuerySliceAxes */
export type DataQuerySliceAxes = QuerySliceAxes<DataQuery, number>;
/** @see QuerySort */
export type DataQuerySort = QuerySort<DataQuery, DataQueryExpression>;
/** @see QueryFilter */
export type DataQueryFilter = QueryFilter<DataQuery, DataQueryBooleanExpression>;
/** @see QueryTransformColumns */
export type DataQueryTransformColumns = QueryTransformColumns<
  DataQuery,
  DataQueryExpression,
  ColumnIdAndTypeSpec
>;

/**
 * Union of all data layer query types.
 *
 * The data layer operates with numeric indices for axes and columns,
 * making it suitable for runtime query execution and optimization.
 *
 * Includes:
 * - Leaf nodes: column, inlineColumn, sparseToDenseColumn
 * - Join operations: innerJoin, fullJoin, outerJoin, linkerJoin
 * - Transformations: sliceAxes, sort, filter, transformColumns
 */
export type DataQuery =
  | DataQueryColumn
  | DataQueryInlineColumn
  | DataQuerySparseToDenseColumn
  | DataQuerySymmetricJoin
  | DataQueryOuterJoin
  | DataQueryLinkerJoin
  | DataQuerySliceAxes
  | DataQuerySort
  | DataQueryFilter
  | DataQueryTransformColumns;

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
  | ExprFillNull<DataQueryExpression>
  | ExprLogicalUnary<DataQueryExpression>
  | ExprLogicalVariadic<DataQueryExpression>
  | ExprIsIn<DataQueryExpression, string>
  | ExprIsIn<DataQueryExpression, number>
  // | ExprIsInPolygon<DataQueryExpression>  -- runtime not wired (see query_common.ts)
  | ExprCast<DataQueryExpression>
  | ExprConditional<DataQueryExpression>
  // | ExprAggregation<DataQueryExpression, number, number>  -- runtime not wired
  | ExprRanking<DataQueryExpression, number, number>;
// | ExprCumulative<DataQueryExpression, number, number>  -- runtime not wired

export type DataQueryBooleanExpression = InferBooleanExpressionUnion<DataQueryExpression>;
