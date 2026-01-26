import type { PObjectId } from '../../pool';
import type { JsonDataInfo } from './data_info';
import type { AxisValueType, ColumnValueType, Domain, PColumnIdAndSpec } from './spec';

/** Single axis selector for spec-layer queries */
export interface SingleAxisSelector {
  /** Axis name (required) */
  name: string;
  /** Axis type (optional) */
  type?: AxisValueType;
  /** Domain requirements (optional) */
  domain?: Domain;
  /** Parent axes requirements (optional) */
  parentAxes?: SingleAxisSelector[];
}

/** Column type spec (id + type info, used in QueryData) */
export interface ColumnTypeSpec {
  id: PObjectId;
  spec: {
    axes: AxisValueType[];
    columns: ColumnValueType[];
  };
}

/** Axis selector (spec layer) */
export interface AxisSelectorSpec {
  type: 'axis';
  id: SingleAxisSelector;
}

/** Column selector (spec layer) */
export interface ColumnSelectorSpec {
  type: 'column';
  id: PObjectId;
}

/** Axis or column selector (spec layer) */
export type SelectorSpec = AxisSelectorSpec | ColumnSelectorSpec;

/** Axis filter for slicing (spec layer) */
export interface AxisFilterSpec {
  type: 'constant';
  axisSelector: SingleAxisSelector;
  constant: unknown;
}

/** Sort entry (spec layer) */
export interface QuerySortEntrySpec {
  axisOrColumn: SelectorSpec;
  ascending: boolean;
  nullsFirst?: boolean | null;
}

/** Join entry for spec layer (no mapping) */
export interface QueryJoinEntrySpec {
  entry: QuerySpec;
}

/** Column reference */
export interface QueryColumnSpec {
  type: 'column';
  columnId: PObjectId;
}

/** Inline column with data */
export interface QueryInlineColumnSpec {
  type: 'inlineColumn';
  specOverride?: PColumnIdAndSpec;
  typeSpec: ColumnTypeSpec;
  dataInfo: JsonDataInfo;
}

/** Cross join column */
export interface QueryCrossJoinColumnSpec {
  type: 'crossJoinColumn';
  columnId: PObjectId;
  specOverride?: PColumnIdAndSpec;
  axesIndices: number[];
}

/** Inner join (spec layer) */
export interface QueryInnerJoinSpec {
  type: 'symmetricJoin';
  innerJoin: {
    entries: QueryJoinEntrySpec[];
  };
}

/** Full join (spec layer) */
export interface QueryFullJoinSpec {
  type: 'symmetricJoin';
  fullJoin: {
    entries: QueryJoinEntrySpec[];
  };
}

/** Outer join (spec layer) */
export interface QueryOuterJoinSpec {
  type: 'outerJoin';
  primary: QueryJoinEntrySpec;
  secondary: QueryJoinEntrySpec[];
}

/** Slice axes operation (spec layer) */
export interface QuerySliceAxesSpec {
  type: 'sliceAxes';
  input: QuerySpec;
  axisFilters: AxisFilterSpec[];
  specOverride?: PColumnIdAndSpec;
}

/** Sort operation (spec layer) */
export interface QuerySortSpec {
  type: 'sort';
  input: QuerySpec;
  sortBy: QuerySortEntrySpec[];
}

/** Filter operation (spec layer) */
export interface QueryFilterSpec {
  type: 'filter';
  input: QuerySpec;
  predicate: QueryExpressionSpec;
}

/** QuerySpec - union of all spec layer query types */
export type QuerySpec =
  | QueryColumnSpec
  | QueryInlineColumnSpec
  | QueryCrossJoinColumnSpec
  | QueryInnerJoinSpec
  | QueryFullJoinSpec
  | QueryOuterJoinSpec
  | QuerySliceAxesSpec
  | QuerySortSpec
  | QueryFilterSpec;

/** Arithmetic operation kinds */
export type ArithmeticKind = 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo';

/** Unary math operation kinds */
export type UnaryMathKind = 'abs' | 'ceil' | 'floor' | 'round' | 'sqrt' | 'ln' | 'log10' | 'exp' | 'sign' | 'negate';

/** Comparison operation kinds */
export type ComparisonKind = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';

/** Aggregation kinds */
export type AggregationKind = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct' | 'first' | 'last' | 'stdDev' | 'variance';

/** Ranking kinds */
export type RankingKind = 'rowNumber' | 'rank' | 'denseRank' | 'percentRank' | 'ntile';

/** Cumulative aggregation kinds */
export type CumulativeKind = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** If-null mode */
export type IfNullMode = 'absent' | 'null' | 'nan' | 'any';

/** 2D point for polygon */
export interface Point2D {
  x: number;
  y: number;
}

export interface ExprColumnRefSpec { type: 'columnRef'; column: PObjectId }
export interface ExprAxisRefSpec { type: 'axisRef'; axis: SingleAxisSelector }
export interface ExprConstant { type: 'constant'; value: unknown }
export interface ExprArithmeticSpec { type: 'arithmetic'; kind: ArithmeticKind; left: QueryExpressionSpec; right: QueryExpressionSpec }
export interface ExprUnaryMathSpec { type: 'unaryMath'; kind: UnaryMathKind; input: QueryExpressionSpec }
export interface ExprCastSpec { type: 'cast'; targetType: ColumnValueType; input: QueryExpressionSpec }
export interface ExprComparisonSpec { type: 'comparison'; kind: ComparisonKind; left: QueryExpressionSpec; right: QueryExpressionSpec }
export interface ExprEqualsSpec { type: 'equals'; input: QueryExpressionSpec; reference: string }
export interface ExprStringContainsSpec { type: 'stringContains'; input: QueryExpressionSpec; substring: string; caseInsensitive: boolean }
export interface ExprMatchesSpec { type: 'matches'; input: QueryExpressionSpec; regex: string }
export interface ExprStringContainsFuzzySpec { type: 'stringContainsFuzzy'; input: QueryExpressionSpec; reference: string; wildcard?: string; maxEdits: number; substitutionsOnly?: boolean; caseInsensitive: boolean }
export interface ExprLogicalAndSpec { type: 'logical'; and: { operands: QueryExpressionSpec[] } }
export interface ExprLogicalOrSpec { type: 'logical'; or: { operands: QueryExpressionSpec[] } }
export interface ExprLogicalNotSpec { type: 'logical'; not: { operand: QueryExpressionSpec } }
export interface ExprIsInSpec { type: 'isIn'; value: QueryExpressionSpec; set: unknown[]; negate?: boolean }
export interface ExprIsInPolygonSpec { type: 'isInPolygon'; x: QueryExpressionSpec; y: QueryExpressionSpec; polygon: Point2D[]; negate?: boolean }
export interface ExprConditionalSpec { type: 'conditional'; cases: { when: QueryExpressionSpec; then: QueryExpressionSpec }[]; otherwise?: QueryExpressionSpec }
export interface ExprIfNullSpec { type: 'ifNull'; mode: IfNullMode; input: QueryExpressionSpec; replacement: QueryExpressionSpec }
export interface ExprIsNASpec { type: 'isNA'; input: QueryExpressionSpec }
export interface ExprAggregationSpec { type: 'aggregation'; kind: AggregationKind; input: QueryExpressionSpec; over?: SelectorSpec[] }
export interface ExprRankingSpec { type: 'ranking'; kind: RankingKind; orderBy: QueryExpressionSpec; ascending?: boolean; partitionBy?: SelectorSpec[] }
export interface ExprCumulativeSpec { type: 'cumulative'; kind: CumulativeKind; input: QueryExpressionSpec; orderBy: QueryExpressionSpec; ascending?: boolean; partitionBy?: SelectorSpec[] }

export type QueryExpressionSpec =
  | ExprColumnRefSpec | ExprAxisRefSpec | ExprConstant
  | ExprArithmeticSpec | ExprUnaryMathSpec | ExprCastSpec | ExprComparisonSpec
  | ExprEqualsSpec | ExprStringContainsSpec | ExprMatchesSpec | ExprStringContainsFuzzySpec
  | ExprLogicalAndSpec | ExprLogicalOrSpec | ExprLogicalNotSpec
  | ExprIsInSpec | ExprIsInPolygonSpec | ExprConditionalSpec | ExprIfNullSpec | ExprIsNASpec
  | ExprAggregationSpec | ExprRankingSpec | ExprCumulativeSpec;
