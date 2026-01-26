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

/** Axis selector (data layer) */
export type AxisSelectorData = QueryAxisSelector<number>;

/** Column selector (data layer) */
export type ColumnSelectorData = QueryColumnSelector<number>;

/** Axis or column selector (data layer) */
export type SelectorData = AxisSelectorData | ColumnSelectorData;

/** Axis filter for slicing (data layer) */
export type AxisFilterData = QueryAxisFilter<number>;

/** Sort entry (data layer) */
export type QuerySortEntryData = QuerySortEntry<SelectorData>;

/** Join entry for data layer (with mapping) */
export interface QueryJoinEntryData extends QueryJoinEntry<QueryData> {
  axesMapping: number[];
  columnsMapping: number[];
}

/** Column reference (data layer) */
export type QueryColumnData = QueryColumn;

/** Inline column with data (data layer) */
export type QueryInlineColumnData = QueryInlineColumn<ColumnTypeSpec, JsonDataInfo>;

/** Cross join column (data layer) */
export type QueryCrossJoinColumnData = QueryCrossJoinColumn<ColumnTypeSpec>;

/** Symmetric join (data layer) */
export type QuerySymmetricJoinData = QuerySymmetricJoin<QueryJoinEntryData>;

/** Outer join (data layer) */
export type QueryOuterJoinData = QueryOuterJoin<QueryJoinEntryData>;

/** Slice axes operation (data layer) */
export type QuerySliceAxesData = QuerySliceAxes<QueryData, AxisFilterData, ColumnTypeSpec>;

/** Sort operation (data layer) */
export type QuerySortData = QuerySort<QueryData, QuerySortEntryData>;

/** Filter operation (data layer) */
export type QueryFilterData = QueryFilter<QueryData, QueryExpressionData>;

/** QueryData - union of all data layer query types */
export type QueryData =
  | QueryColumnData
  | QueryInlineColumnData
  | QueryCrossJoinColumnData
  | QuerySymmetricJoinData
  | QueryOuterJoinData
  | QuerySliceAxesData
  | QuerySortData
  | QueryFilterData;

/** Axis reference (data layer) */
export interface ExprAxisRefData extends Type<'axisRef'>, Value<number> {}
/** Column reference (data layer) */
export interface ExprColumnRefData extends Type<'columnRef'>, Value<number> {}

/** Data-layer ranking expression (with SelectorData) */
export type ExprRankingData = ExprRanking<QueryExpressionData, SelectorData>;
/** Data-layer cumulative expression (with SelectorData) */
export type ExprCumulativeData = ExprCumulative<QueryExpressionData, SelectorData>;
/** Data-layer aggregation expression (with SelectorData) */
export type ExprAggregationData = ExprAggregation<QueryExpressionData, SelectorData>;

export type QueryExpressionData =
  | ExprColumnRefData | ExprAxisRefData | ExprConstant
  | ExprCast<QueryExpressionData>
  | ExprBinaryMath<QueryExpressionData> | ExprUnaryMath<QueryExpressionData>
  | ExprStringEquals<QueryExpressionData> | ExprStringContains<QueryExpressionData> | ExprStringRegex<QueryExpressionData> | ExprStringContainsFuzzy<QueryExpressionData>
  | ExprLogicalUnary<QueryExpressionData> | ExprLogicalVariadic<QueryExpressionData>
  | ExprIsIn<QueryExpressionData, string> | ExprIsIn<QueryExpressionData, number> | ExprIsInPolygon<QueryExpressionData>
  | ExprConditional<QueryExpressionData> | ExprIfNull<QueryExpressionData> | ExprIsNA<QueryExpressionData>
  | ExprAggregationData | ExprRankingData | ExprCumulativeData;
