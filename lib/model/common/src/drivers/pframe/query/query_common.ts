import type { PObjectId } from '../../../pool';
import type { AxisValueType, ColumnValueType } from '../spec';

// ============ Type Spec Types ============

export type TypeSpec = {
  axes: AxisValueType[];
  columns: ColumnValueType[];
};

export type ColumnTypeSpec = {
  id: PObjectId;
  typeSpec: TypeSpec;
};

// ============ Operand Types ============

/** Unary math operation kinds */
export type UnaryMathOperand = 'abs' | 'ceil' | 'floor' | 'round' | 'sqrt' | 'ln' | 'log10' | 'exp' | 'sign' | 'negate';

/** Binary math operation kinds */
export type BinaryMathOperand = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';

/** Aggregation kinds */
export type AggregationOperand = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'countDistinct' | 'first' | 'last' | 'stdDev' | 'variance';

/** Ranking kinds */
export type RankingOperand = 'rowNumber' | 'rank' | 'denseRank' | 'percentRank' | 'ntile';

/** Cumulative aggregation kinds */
export type CumulativeOperand = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** If-null mode */
export type IfNullMode = 'absent' | 'null' | 'nan' | 'any';

// ============ Geometric Types ============

/** 2D point for polygon */
export type Point2D = {
  x: number;
  y: number;
};

// ============ Type Building Helpers ============

export type Type<T extends string> = { type: T };
export type Operand<T extends string> = { operand: T };
export type Value<T> = { value: T };
export type Input<T> = { input: T };
export type Binary<L, R = L> = { left: L; right: R };

// ============ Constant Expression ============

/** Constant expression */
export type ExprConstant = Type<'constant'> & Value<string | number | boolean>;

// ============ Generic Expression Interfaces ============
// I = expression type (recursive), S = selector type

/** Type cast expression */
export interface ExprCast<I> extends
  Type<'cast'>,
  Input<I> {
  targetType: ColumnValueType;
}

/** Unary math expression (abs, ceil, floor, etc.) */
export interface ExprUnaryMath<I> extends
  Type<'unaryMath'>,
  Operand<UnaryMathOperand>,
  Input<I>
{}

/** Binary math expression (add, sub, mul, div, comparisons) */
export interface ExprBinaryMath<I> extends
  Type<'binaryMath'>,
  Operand<BinaryMathOperand>,
  Binary<I>
{}

/** String equality check */
export interface ExprStringEquals<I> extends
  Type<'stringEquals'>,
  Value<string>,
  Input<I>
{}

/** String regex match */
export interface ExprStringRegex<I> extends
  Type<'stringRegex'>,
  Value<string>,
  Input<I>
{}

/** String contains check */
export interface ExprStringContains<I> extends
  Type<'stringContains'>,
  Value<string>,
  Input<I> {
  caseInsensitive?: boolean;
}

/** Fuzzy string contains check */
export interface ExprStringContainsFuzzy<I> extends
  Type<'stringContainsFuzzy'>,
  Value<string>,
  Input<I> {
  wildcard?: string;
  maxEdits?: number;
  substitutionsOnly?: boolean;
  caseInsensitive?: boolean;
}

/** Logical NOT expression */
export interface ExprLogicalUnary<I> extends
  Type<'logical'>,
  Operand<'not'>,
  Input<I>
{}

/** Logical AND/OR expression */
export interface ExprLogicalVariadic<I> extends
  Type<'logical'>,
  Operand<'and' | 'or'>,
  Input<I[]>
{}

/** Check if value is in a set */
export interface ExprIsIn<I, T extends string | number> extends
  Type<'isIn'>,
  Input<I> {
  set: T[];
  negate?: boolean;
}

/** Check if point is inside a polygon */
export interface ExprIsInPolygon<X, Y = X> extends
  Type<'isInPolygon'> {
  x: X;
  y: Y;
  polygon: Point2D[];
  negate?: boolean;
}

/** Conditional (CASE WHEN) expression */
export interface ExprConditional<W, T = W, O = W | T> extends
  Type<'conditional'> {
  cases: { when: W; then: T }[];
  otherwise?: O;
}

/** If-null replacement expression */
export interface ExprIfNull<I> extends
  Type<'ifNull'>,
  Input<I> {
  mode: IfNullMode;
  replacement: I;
}

/** Check if value is NA (null/absent/nan) */
export interface ExprIsNA<I> extends
  Type<'isNA'>,
  Input<I>
{}

/** Window ranking expression (row_number, rank, dense_rank, etc.) */
export interface ExprRanking<I, S> extends
  Type<'ranking'>,
  Operand<RankingOperand> {
  orderBy: I;
  ascending?: boolean;
  partitionBy?: S[];
}

/** Cumulative aggregation expression (running sum, avg, etc.) */
export interface ExprCumulative<I, S> extends
  Type<'cumulative'>,
  Operand<CumulativeOperand>,
  Input<I> {
  orderBy: I;
  ascending?: boolean;
  partitionBy?: S[];
}

/** Aggregation expression (sum, avg, min, max, count, etc.) */
export interface ExprAggregation<I, S> extends
  Type<'aggregation'>,
  Operand<AggregationOperand>,
  Input<I> {
  over?: S[];
}

// ============ Generic Query Types ============
// A = Axis ID type, S = Selector type, Q = Query type, E = Expression type
// AF = Axis filter type, SE = Sort entry type, JE = Join entry type, SO = Spec override type

/** Axis selector */
export interface QueryAxisSelector<A> extends Type<'axis'> {
  id: A;
}

/** Column selector */
export interface QueryColumnSelector<C> extends Type<'column'> {
  id: C;
}

/** Axis filter for slicing */
export interface QueryAxisFilter<A> extends Type<'constant'> {
  axisSelector: A;
  constant: 'string' | 'number' | 'boolean';
}

/** Sort entry */
export interface QuerySortEntry<S> {
  axisOrColumn: S;
  ascending: boolean;
  nullsFirst?: boolean | null;
}

/** Outer join */
export interface QueryOuterJoin<JE> extends Type<'outerJoin'> {
  primary: JE;
  secondary: JE[];
}

/** Slice axes operation */
export interface QuerySliceAxes<Q, AF, SO> extends Type<'sliceAxes'> {
  input: Q;
  axisFilters: AF[];
  specOverride?: SO;
}

/** Sort operation */
export interface QuerySort<Q, SE> extends Type<'sort'> {
  input: Q;
  sortBy: SE[];
}

/** Filter operation */
export interface QueryFilter<Q, E> extends Type<'filter'> {
  input: Q;
  predicate: E;
}

/** Column reference query */
export interface QueryColumn extends Type<'column'> {
  columnId: PObjectId;
}

/** Inline column with data */
export interface QueryInlineColumn<T, D> extends Type<'inlineColumn'> {
  specOverride: T;
  typeSpec: T;
  dataInfo: D;
}

/** Cross join column */
export interface QueryCrossJoinColumn<SO> extends Type<'crossJoinColumn'> {
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
