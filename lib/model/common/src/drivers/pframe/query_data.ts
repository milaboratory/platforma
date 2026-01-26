import type { PObjectId } from '../../pool';
import type { JsonDataInfo } from './data_info';
import type { ColumnValueType } from './spec';
import type {
  AggregationKind,
  ArithmeticKind,
  ColumnTypeSpec,
  ComparisonKind,
  CumulativeKind,
  ExprConstant,
  IfNullMode,
  Point2D,
  RankingKind,
  UnaryMathKind,
} from './query_spec';

/** Axis selector (data layer) */
export interface AxisSelectorData {
  type: 'axis';
  id: number;
}

/** Column selector (data layer) */
export interface ColumnSelectorData {
  type: 'column';
  id: number;
}

/** Axis or column selector (data layer) */
export type SelectorData = AxisSelectorData | ColumnSelectorData;

/** Axis filter for slicing (data layer) */
export interface AxisFilterData {
  type: 'constant';
  axisSelector: number;
  constant: unknown;
}

/** Sort entry (data layer) */
export interface QuerySortEntryData {
  axisOrColumn: SelectorData;
  ascending: boolean;
  nullsFirst?: boolean | null;
}

/** Join entry for data layer (with mapping) */
export interface QueryJoinEntryData {
  entry: QueryData;
  axesMapping: number[];
  columnsMapping: number[];
}

/** Column reference (data layer) */
export interface QueryColumnData {
  type: 'column';
  columnId: PObjectId;
}

/** Inline column with data (data layer) */
export interface QueryInlineColumnData {
  type: 'inlineColumn';
  specOverride?: ColumnTypeSpec;
  typeSpec: ColumnTypeSpec;
  dataInfo: JsonDataInfo;
}

/** Cross join column (data layer) */
export interface QueryCrossJoinColumnData {
  type: 'crossJoinColumn';
  columnId: PObjectId;
  specOverride?: ColumnTypeSpec;
  axesIndices: number[];
}

/** Inner join (data layer) */
export interface QueryInnerJoinData {
  type: 'symmetricJoin';
  innerJoin: {
    entries: QueryJoinEntryData[];
  };
}

/** Full join (data layer) */
export interface QueryFullJoinData {
  type: 'symmetricJoin';
  fullJoin: {
    entries: QueryJoinEntryData[];
  };
}

/** Outer join (data layer) */
export interface QueryOuterJoinData {
  type: 'outerJoin';
  primary: QueryJoinEntryData;
  secondary: QueryJoinEntryData[];
}

/** Slice axes operation (data layer) */
export interface QuerySliceAxesData {
  type: 'sliceAxes';
  input: QueryData;
  axisFilters: AxisFilterData[];
  specOverride?: ColumnTypeSpec;
}

/** Sort operation (data layer) */
export interface QuerySortData {
  type: 'sort';
  input: QueryData;
  sortBy: QuerySortEntryData[];
}

/** Filter operation (data layer) */
export interface QueryFilterData {
  type: 'filter';
  input: QueryData;
  predicate: QueryExpressionData;
}

/** QueryData - union of all data layer query types */
export type QueryData =
  | QueryColumnData
  | QueryInlineColumnData
  | QueryCrossJoinColumnData
  | QueryInnerJoinData
  | QueryFullJoinData
  | QueryOuterJoinData
  | QuerySliceAxesData
  | QuerySortData
  | QueryFilterData;

export interface ExprColumnRefData { type: 'columnRef'; column: number }
export interface ExprAxisRefData { type: 'axisRef'; axis: number }
export interface ExprArithmeticData { type: 'arithmetic'; kind: ArithmeticKind; left: QueryExpressionData; right: QueryExpressionData }
export interface ExprUnaryMathData { type: 'unaryMath'; kind: UnaryMathKind; input: QueryExpressionData }
export interface ExprCastData { type: 'cast'; targetType: ColumnValueType; input: QueryExpressionData }
export interface ExprComparisonData { type: 'comparison'; kind: ComparisonKind; left: QueryExpressionData; right: QueryExpressionData }
export interface ExprEqualsData { type: 'equals'; input: QueryExpressionData; reference: string }
export interface ExprStringContainsData { type: 'stringContains'; input: QueryExpressionData; substring: string; caseInsensitive: boolean }
export interface ExprMatchesData { type: 'matches'; input: QueryExpressionData; regex: string }
export interface ExprStringContainsFuzzyData { type: 'stringContainsFuzzy'; input: QueryExpressionData; reference: string; wildcard?: string; maxEdits: number; substitutionsOnly?: boolean; caseInsensitive: boolean }
export interface ExprLogicalAndData { type: 'logical'; and: { operands: QueryExpressionData[] } }
export interface ExprLogicalOrData { type: 'logical'; or: { operands: QueryExpressionData[] } }
export interface ExprLogicalNotData { type: 'logical'; not: { operand: QueryExpressionData } }
export interface ExprIsInData { type: 'isIn'; value: QueryExpressionData; set: unknown[]; negate?: boolean }
export interface ExprIsInPolygonData { type: 'isInPolygon'; x: QueryExpressionData; y: QueryExpressionData; polygon: Point2D[]; negate?: boolean }
export interface ExprConditionalData { type: 'conditional'; cases: { when: QueryExpressionData; then: QueryExpressionData }[]; otherwise?: QueryExpressionData }
export interface ExprIfNullData { type: 'ifNull'; mode: IfNullMode; input: QueryExpressionData; replacement: QueryExpressionData }
export interface ExprIsNAData { type: 'isNA'; input: QueryExpressionData }
export interface ExprAggregationData { type: 'aggregation'; kind: AggregationKind; input: QueryExpressionData; over?: SelectorData[] }
export interface ExprRankingData { type: 'ranking'; kind: RankingKind; orderBy: QueryExpressionData; ascending?: boolean; partitionBy?: SelectorData[] }
export interface ExprCumulativeData { type: 'cumulative'; kind: CumulativeKind; input: QueryExpressionData; orderBy: QueryExpressionData; ascending?: boolean; partitionBy?: SelectorData[] }

export type QueryExpressionData =
  | ExprColumnRefData | ExprAxisRefData | ExprConstant
  | ExprArithmeticData | ExprUnaryMathData | ExprCastData | ExprComparisonData
  | ExprEqualsData | ExprStringContainsData | ExprMatchesData | ExprStringContainsFuzzyData
  | ExprLogicalAndData | ExprLogicalOrData | ExprLogicalNotData
  | ExprIsInData | ExprIsInPolygonData | ExprConditionalData | ExprIfNullData | ExprIsNAData
  | ExprAggregationData | ExprRankingData | ExprCumulativeData;
