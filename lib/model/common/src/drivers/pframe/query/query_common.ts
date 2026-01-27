import type { PObjectId } from '../../../pool';
import type { JsonDataInfo } from '../data_info';
import type { AxisValueType, ColumnValueType } from '../spec';

// ============ Type Spec Types ============

export type TypeSpec = {
  axes: AxisValueType[];
  columns: ColumnValueType[];
};

// ============ Operand Types ============

/** Unary math operation kinds */
export type UnaryMathOperand = 'abs' | 'ceil' | 'floor' | 'round' | 'sqrt' | 'log' | 'log2' | 'log10' | 'exp' | 'negate';

/** Binary math operation kinds */
export type BinaryMathOperand = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';

/** Aggregation kinds */
export type AggregationOperand = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'median' | 'first' | 'last' | 'stdDev' | 'variance';

/** Ranking kinds */
export type RankOperand = 'rank' | 'denseRank' | 'rowNumber';

/** Cumulative aggregation kinds */
export type CumulativeOperand = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** If-null mode */
export type IfNullMode = 'absent' | 'na' | 'both';

// ============ Geometric Types ============

/** 2D point for polygon */
export type Point2D = {
  x: number;
  y: number;
};

// ============ Constant Expression ============

/** Constant expression */
export type ExprConstant = {
  type: 'constant';
  value: string | number | boolean;
};

// ============ Generic Expression Interfaces ============
// I = expression type (recursive), S = selector type

/** Unary math expression (abs, ceil, floor, etc.) */
export interface ExprUnaryMath<I> {
  type: 'unaryMath';
  operand: UnaryMathOperand;
  input: I;
}

/** Binary math expression (add, sub, mul, div, comparisons) */
export interface ExprBinaryMath<I> {
  type: 'binaryMath';
  operand: BinaryMathOperand;
  left: I;
  right: I;
}

/** String equality check */
export interface ExprStringEquals<I> {
  type: 'stringEquals';
  input: I;
  value: string;
}

/** String regex match */
export interface ExprStringRegex<I> {
  type: 'stringRegex';
  input: I;
  value: string;
}

/** String contains check */
export interface ExprStringContains<I> {
  type: 'stringContains';
  input: I;
  value: string;
  caseInsensitive: boolean;
}

/** Fuzzy string contains check */
export interface ExprStringContainsFuzzy<I> {
  type: 'stringContainsFuzzy';
  input: I;
  value: string;
  maxEdits: number;
  caseInsensitive: boolean;
  substitutionsOnly: boolean;
  wildcard: null | string;
}

/** Logical NOT expression */
export interface ExprLogicalUnary<I> {
  type: 'logical';
  operand: 'not';
  input: I;
}

/** Logical AND/OR expression */
export interface ExprLogicalVariadic<I> {
  type: 'logical';
  operand: 'and' | 'or';
  input: I[];
}

/** Check if value is in a set */
export interface ExprIsIn<I, T extends string | number> {
  type: 'isIn';
  input: I;
  set: T[];
  negate: boolean;
}

/** Check if point is inside a polygon */
export interface ExprIsInPolygon<X, Y = X> {
  type: 'isInPolygon';
  x: X;
  y: Y;
  polygon: Point2D[];
  negate: boolean;
}

/** Check if value is NA (null/absent/nan) */
export interface ExprIsNA<I> {
  type: 'isNA';
  input: I;
}

// ============ Generic Query Types ============
// A = Axis ID type, S = Selector type, Q = Query type, E = Expression type
// AF = Axis filter type, SE = Sort entry type, JE = Join entry type, SO = Spec override type

/** Axis selector */
export interface QueryAxisSelector<A> {
  type: 'axis';
  id: A;
}

/** Column selector */
export interface QueryColumnSelector<C> {
  type: 'column';
  id: C;
}

/** Axis filter for slicing */
export interface QueryAxisFilter<A> {
  type: 'constant';
  constant: string | number;
  axisSelector: A;
}

/** Sort entry */
export interface QuerySortEntry<S> {
  axisOrColumn: S;
  ascending: boolean;
  nullsFirst: null | boolean;
}

/** Outer join */
export interface QueryOuterJoin<JE> {
  type: 'outerJoin';
  primary: JE;
  secondary: JE[];
}

/** Slice axes operation */
export interface QuerySliceAxes<Q, A> {
  type: 'sliceAxes';
  input: Q;
  axisFilters: QueryAxisFilter<A>[];
}

/** Sort operation */
export interface QuerySort<Q, SE> {
  type: 'sort';
  input: Q;
  sortBy: SE[];
}

/** Filter operation */
export interface QueryFilter<Q, E> {
  type: 'filter';
  input: Q;
  predicate: E;
}

/** Column reference query */
export interface QueryColumn {
  type: 'column';
  columnId: PObjectId;
}

/** Inline column with data */
export interface QueryInlineColumn<T> {
  type: 'inlineColumn';
  spec: T;
  dataInfo: JsonDataInfo;
}

/** Cross join column */
export interface QueryCrossJoinColumn<SO> {
  type: 'crossJoinColumn';
  columnId: PObjectId;
  specOverride?: SO;
  axesIndices: number[];
}

/** Symmetric join (inner/full) */
export interface QuerySymmetricJoin<JE> {
  type: 'innerJoin' | 'fullJoin';
  entries: JE[];
}

/** Join entry base */
export interface QueryJoinEntry<Q> {
  entry: Q;
}
