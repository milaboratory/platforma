import type { PObjectId } from '../../../pool';
import type { JsonDataInfo } from '../data_info';
import type {
  ColumnTypeSpec,
  ExprAggregation,
  ExprBinaryMath,
  ExprCast,
  ExprConditional,
  ExprConstant,
  ExprCumulative,
  ExprIfNull,
  ExprIsIn,
  ExprIsInPolygon,
  ExprIsNA,
  ExprLogicalUnary,
  ExprLogicalVariadic,
  ExprRanking,
  ExprStringContains,
  ExprStringContainsFuzzy,
  ExprStringEquals,
  ExprStringRegex,
  ExprUnaryMath,
  QueryAxisFilter,
  QueryAxisSelector,
  QueryColumn,
  QueryColumnSelector,
  QueryCrossJoinColumn,
  QueryFilter,
  QueryInlineColumn,
  QueryJoinEntry,
  QueryOuterJoin,
  QuerySliceAxes,
  QuerySort,
  QuerySortEntry,
  QuerySymmetricJoin,
  Type,
  Value,
} from './query_common';
import type { AxisValueType, Domain, PColumnIdAndSpec, PColumnSpec } from '../spec';

// Re-export common types for convenience
export type {
  AggregationOperand,
  BinaryMathOperand,
  ColumnTypeSpec,
  CumulativeOperand,
  ExprConstant,
  IfNullMode,
  Point2D,
  RankingOperand,
  TypeSpec,
  UnaryMathOperand,
} from './query_common';

/** Single axis selector for spec-layer queries */
export type SingleAxisSelector = {
  /** Axis name (required) */
  name: string;
  /** Axis type (optional) */
  type?: AxisValueType;
  /** Domain requirements (optional) */
  domain?: Domain;
  /** Parent axes requirements (optional) */
  parentAxes?: SingleAxisSelector[];
};

/** Column type spec (id + type info, used in QueryData) */
type ColumnIdAndSpec = {
  typeSpec: ColumnTypeSpec;
  spec: PColumnSpec;
};

/** Axis selector (spec layer) */
export type AxisSelectorSpec = QueryAxisSelector<SingleAxisSelector>;

/** Column selector (spec layer) */
export type ColumnSelectorSpec = QueryColumnSelector<PObjectId>;

/** Axis or column selector (spec layer) */
export type SelectorSpec = AxisSelectorSpec | ColumnSelectorSpec;

/** Axis filter for slicing (spec layer) */
export type AxisFilterSpec = QueryAxisFilter<SingleAxisSelector>;

/** Sort entry (spec layer) */
export type QuerySortEntrySpec = QuerySortEntry<SelectorSpec>;

/** Join entry for spec layer (no mapping) */
export type QueryJoinEntrySpec = QueryJoinEntry<QuerySpec>;

/** Column reference */
export type QueryColumnSpec = QueryColumn;

/** Inline column with data */
export type QueryInlineColumnSpec = QueryInlineColumn<ColumnIdAndSpec, JsonDataInfo>;

/** Cross join column */
export type QueryCrossJoinColumnSpec = QueryCrossJoinColumn<PColumnIdAndSpec>;

/** Symmetric join (spec layer) */
export type QuerySymmetricJoinSpec = QuerySymmetricJoin<QueryJoinEntrySpec>;

/** Outer join (spec layer) */
export type QueryOuterJoinSpec = QueryOuterJoin<QueryJoinEntrySpec>;

/** Slice axes operation (spec layer) */
export type QuerySliceAxesSpec = QuerySliceAxes<QuerySpec, AxisFilterSpec, PColumnIdAndSpec>;

/** Sort operation (spec layer) */
export type QuerySortSpec = QuerySort<QuerySpec, QuerySortEntrySpec>;

/** Filter operation (spec layer) */
export type QueryFilterSpec = QueryFilter<QuerySpec, QueryExpressionSpec>;

/** QuerySpec - union of all spec layer query types */
export type QuerySpec =
  | QueryColumnSpec
  | QueryInlineColumnSpec
  | QueryCrossJoinColumnSpec
  | QuerySymmetricJoinSpec
  | QueryOuterJoinSpec
  | QuerySliceAxesSpec
  | QuerySortSpec
  | QueryFilterSpec;

/** Axis reference expression */
export type ExprAxisRefSpec = Type<'axisRef'> & Value<SingleAxisSelector>;
/** Column reference expression */
export type ExprColumnRefSpec = Type<'columnRef'> & Value<PObjectId>;

/** Spec-layer ranking expression (with SelectorSpec) */
export type ExprRankingSpec = ExprRanking<QueryExpressionSpec, SelectorSpec>;
/** Spec-layer cumulative expression (with SelectorSpec) */
export type ExprCumulativeSpec = ExprCumulative<QueryExpressionSpec, SelectorSpec>;
/** Spec-layer aggregation expression (with SelectorSpec) */
export type ExprAggregationSpec = ExprAggregation<QueryExpressionSpec, SelectorSpec>;

export type QueryExpressionSpec =
  | ExprColumnRefSpec | ExprAxisRefSpec | ExprConstant
  | ExprCast<QueryExpressionSpec>
  | ExprBinaryMath<QueryExpressionSpec> | ExprUnaryMath<QueryExpressionSpec>
  | ExprStringEquals<QueryExpressionSpec> | ExprStringContains<QueryExpressionSpec> | ExprStringRegex<QueryExpressionSpec> | ExprStringContainsFuzzy<QueryExpressionSpec>
  | ExprLogicalUnary<QueryExpressionSpec> | ExprLogicalVariadic<QueryExpressionSpec>
  | ExprIsIn<QueryExpressionSpec, string> | ExprIsIn<QueryExpressionSpec, number> | ExprIsInPolygon<QueryExpressionSpec>
  | ExprConditional<QueryExpressionSpec> | ExprIfNull<QueryExpressionSpec> | ExprIsNA<QueryExpressionSpec>
  | ExprAggregationSpec | ExprRankingSpec | ExprCumulativeSpec;
