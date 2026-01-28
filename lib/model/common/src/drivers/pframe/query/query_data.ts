import type { PObjectId } from '../../../pool';
import type {
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
  TypeSpec,
} from './query_common';

type ColumnIdAndTypeSpec = {
  id: PObjectId;
  typeSpec: TypeSpec;
};

/** Axis selector (data layer) */
export type AxisSelectorData = QueryAxisSelector<number>;

/** Column selector (data layer) */
export type ColumnSelectorData = QueryColumnSelector<number>;

/** Axis or column selector (data layer) */
export type SelectorData = AxisSelectorData | ColumnSelectorData;

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
export type QueryInlineColumnData = QueryInlineColumn<ColumnIdAndTypeSpec>;

/** Cross join column (data layer) */
export type QueryCrossJoinColumnData = QueryCrossJoinColumn<ColumnIdAndTypeSpec>;

/** Symmetric join (data layer) */
export type QuerySymmetricJoinData = QuerySymmetricJoin<QueryJoinEntryData>;

/** Outer join (data layer) */
export type QueryOuterJoinData = QueryOuterJoin<QueryJoinEntryData>;

/** Slice axes operation (data layer) */
export type QuerySliceAxesData = QuerySliceAxes<QueryData, number>;

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
export interface ExprAxisRefData { type: 'axisRef'; value: number }
/** Column reference (data layer) */
export interface ExprColumnRefData { type: 'columnRef'; value: number }

export type QueryExpressionData =
  | ExprColumnRefData | ExprAxisRefData | ExprConstant
  | ExprNumericBinary<QueryExpressionData> | ExprNumericUnary<QueryExpressionData>
  | ExprStringEquals<QueryExpressionData> | ExprStringContains<QueryExpressionData> | ExprStringRegex<QueryExpressionData> | ExprStringContainsFuzzy<QueryExpressionData>
  | ExprLogicalUnary<QueryExpressionData> | ExprLogicalVariadic<QueryExpressionData>
  | ExprIsIn<QueryExpressionData, string> | ExprIsIn<QueryExpressionData, number>
  ;
