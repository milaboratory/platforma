/**
 * Base expressionImpl classes and interfaces for PTabler JavaScript implementation
 */

import type {
  AggregationType,
  BinaryArithmeticExpression,
  BinaryArithmeticOperator,
  BooleanLogicExpression,
  ColumnReferenceExpression,
  ComparisonExpression,
  ComparisonOperator,
  ConstantValueExpression,
  CumsumExpression,
  Expression,
  ExtendedUnaryStringExpression,
  FillNaNExpression,
  FillNullExpression,
  FuzzyFilterDistanceMetric,
  FuzzyStringFilterExpression,
  MinMaxExpression,
  MinMaxOperator,
  NotExpression,
  RankExpression,
  StringContainsExpression,
  StringDistanceExpression,
  StringDistanceMetric,
  StringJoinExpression,
  StringReplaceExpression,
  SubstringExpression,
  UnaryArithmeticExpression,
  UnaryArithmeticOperator,
  WhenThenOtherwiseExpression,
  WindowExpression,
} from './types';

/**
 * Base abstract class for all expressions
 */
export abstract class ExpressionImpl {
  protected _alias?: string;

  /**
   * Convert the expressionImpl to JSON format compatible with PTabler schema
   */
  abstract toJSON(): Expression;

  /**
   * Get the alias for this expressionImpl (defaults to a generated name)
   */
  abstract getAlias(): string;

  /**
   * Set an alias for this expression
   */
  alias(name: string): ExpressionImpl {
    const cloned = this.clone();
    cloned._alias = name;
    return cloned;
  }

  /**
   * Clone this expression
   */
  protected abstract clone(): ExpressionImpl;

  // Arithmetic operations
  plus(other: ExpressionImpl | number | string): ArithmeticExpressionImpl {
    return new ArithmeticExpressionImpl('plus', this, coerceToExpression(other));
  }

  minus(other: ExpressionImpl | number | string): ArithmeticExpressionImpl {
    return new ArithmeticExpressionImpl('minus', this, coerceToExpression(other));
  }

  multiply(other: ExpressionImpl | number | string): ArithmeticExpressionImpl {
    return new ArithmeticExpressionImpl('multiply', this, coerceToExpression(other));
  }

  truediv(other: ExpressionImpl | number | string): ArithmeticExpressionImpl {
    return new ArithmeticExpressionImpl('truediv', this, coerceToExpression(other));
  }

  floordiv(other: ExpressionImpl | number | string): ArithmeticExpressionImpl {
    return new ArithmeticExpressionImpl('floordiv', this, coerceToExpression(other));
  }

  // Comparison operations
  gt(other: ExpressionImpl | number | string): ComparisonExpressionImpl {
    return new ComparisonExpressionImpl('gt', this, coerceToExpression(other));
  }

  ge(other: ExpressionImpl | number | string): ComparisonExpressionImpl {
    return new ComparisonExpressionImpl('ge', this, coerceToExpression(other));
  }

  eq(other: ExpressionImpl | number | string): ComparisonExpressionImpl {
    return new ComparisonExpressionImpl('eq', this, coerceToExpression(other));
  }

  lt(other: ExpressionImpl | number | string): ComparisonExpressionImpl {
    return new ComparisonExpressionImpl('lt', this, coerceToExpression(other));
  }

  le(other: ExpressionImpl | number | string): ComparisonExpressionImpl {
    return new ComparisonExpressionImpl('le', this, coerceToExpression(other));
  }

  neq(other: ExpressionImpl | number | string): ComparisonExpressionImpl {
    return new ComparisonExpressionImpl('neq', this, coerceToExpression(other));
  }

  // Logical operations
  and(...others: ExpressionImpl[]): LogicalExpressionImpl {
    return new LogicalExpressionImpl('and', [this, ...others]);
  }

  or(...others: ExpressionImpl[]): LogicalExpressionImpl {
    return new LogicalExpressionImpl('or', [this, ...others]);
  }

  not(): LogicalExpressionImpl {
    return new LogicalExpressionImpl('not', [this]);
  }

  // Unary arithmetic operations
  abs(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('abs', this);
  }

  sqrt(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('sqrt', this);
  }

  log(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('log', this);
  }

  log10(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('log10', this);
  }

  log2(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('log2', this);
  }

  floor(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('floor', this);
  }

  ceil(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('ceil', this);
  }

  round(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('round', this);
  }

  negate(): UnaryArithmeticExpressionImpl {
    return new UnaryArithmeticExpressionImpl('negate', this);
  }

  // Null checks
  isNull(): NullCheckExpressionImpl {
    return new NullCheckExpressionImpl('is_na', this);
  }

  isNotNull(): NullCheckExpressionImpl {
    return new NullCheckExpressionImpl('is_not_na', this);
  }

  // Fill null/NaN
  fillNull(value: ExpressionImpl): FillNullExpressionImpl {
    return new FillNullExpressionImpl(this, coerceToExpression(value));
  }

  fillNaN(value: ExpressionImpl): FillNaNExpressionImpl {
    return new FillNaNExpressionImpl(this, coerceToExpression(value));
  }

  // String operations
  strConcat(...others: (ExpressionImpl | string)[]): StringConcatExpressionImpl {
    return new StringConcatExpressionImpl([this, ...others.map(coerceToExpression)]);
  }

  substring(start: number, length?: number): SubstringExpressionImpl {
    return new SubstringExpressionImpl(this, start, length);
  }

  strReplace(pattern: string, value: string, options?: Pick<StringReplaceExpression, 'replaceAll' | 'literal'>): StringReplaceExpressionImpl {
    return new StringReplaceExpressionImpl(this, pattern, value, options);
  }

  strContains(pattern: ExpressionImpl | string, literal?: boolean, strict?: boolean): StringContainsExpressionImpl {
    return new StringContainsExpressionImpl(this, coerceToExpression(pattern), literal, strict);
  }

  strToUpper(): StringCaseExpressionImpl {
    return new StringCaseExpressionImpl('to_upper', this);
  }

  strToLower(): StringCaseExpressionImpl {
    return new StringCaseExpressionImpl('to_lower', this);
  }

  strStartsWith(pattern: ExpressionImpl | string): StringStartsWithExpressionImpl {
    return new StringStartsWithExpressionImpl(this, coerceToExpression(pattern));
  }

  strEndsWith(pattern: ExpressionImpl | string): StringEndsWithExpressionImpl {
    return new StringEndsWithExpressionImpl(this, coerceToExpression(pattern));
  }

  // Aggregation operations
  sum(): AggregationExpressionImpl {
    return new AggregationExpressionImpl('sum', this);
  }

  mean(): AggregationExpressionImpl {
    return new AggregationExpressionImpl('mean', this);
  }

  count(): AggregationExpressionImpl {
    return new AggregationExpressionImpl('count', this);
  }

  min(): AggregationExpressionImpl {
    return new AggregationExpressionImpl('min', this);
  }

  max(): AggregationExpressionImpl {
    return new AggregationExpressionImpl('max', this);
  }

  first(): AggregationExpressionImpl {
    return new AggregationExpressionImpl('first', this);
  }

  last(): AggregationExpressionImpl {
    return new AggregationExpressionImpl('last', this);
  }

  cumsum(): CumsumExpressionImpl {
    return new CumsumExpressionImpl(this);
  }

  // Fuzzy operations
  stringDistance(other: ExpressionImpl | string, metric: StringDistanceMetric, returnSimilarity?: boolean): StringDistanceExpressionImpl {
    return new StringDistanceExpressionImpl(
      this,
      coerceToExpression(other),
      metric,
      returnSimilarity,
    );
  }

  fuzzyStringFilter(pattern: ExpressionImpl | string, metric: FuzzyFilterDistanceMetric, bound: number): FuzzyStringFilterExpressionImpl {
    return new FuzzyStringFilterExpressionImpl(
      this,
      coerceToExpression(pattern),
      metric,
      bound,
    );
  }
}

export class ColumnExpressionImpl extends ExpressionImpl {
  constructor(private columnName: string) {
    super();
  }

  toJSON(): ColumnReferenceExpression {
    return {
      type: 'col',
      name: this.columnName,
    };
  }

  getAlias(): string {
    return this._alias || this.columnName;
  }

  protected clone(): ExpressionImpl {
    const cloned = new ColumnExpressionImpl(this.columnName);
    cloned._alias = this._alias;
    return cloned;
  }

  /**
   * Get the column name
   */
  getColumnName(): string {
    return this.columnName;
  }
}

/**
 * Helper function to coerce values to expressions
 */
export function coerceToExpression(value: ExpressionImpl | LiteralValue): ExpressionImpl {
  if (value instanceof ExpressionImpl) {
    return value;
  }
  return new LiteralExpressionImpl(value);
}

export class MinMaxExpressionImpl extends ExpressionImpl {
  constructor(private op: MinMaxOperator, private ops: ExpressionImpl[]) {
    super();
  }

  toJSON(): MinMaxExpression {
    return {
      type: this.op,
      operands: this.ops.map((o) => o.toJSON()),
    };
  }

  getAlias(): string {
    return this._alias || `${this.op}_${this.ops.map((o) => o.getAlias()).join('_')}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new MinMaxExpressionImpl(this.op, this.ops);
    cloned._alias = this._alias;
    return cloned;
  }
}

// Forward declarations for concrete expressionImpl classes
// These will be imported from their respective modules
export class ArithmeticExpressionImpl extends ExpressionImpl {
  constructor(
    private operator: BinaryArithmeticOperator,
    private lhs: ExpressionImpl,
    private rhs: ExpressionImpl,
  ) {
    super();
  }

  toJSON(): BinaryArithmeticExpression {
    return {
      type: this.operator,
      lhs: this.lhs.toJSON(),
      rhs: this.rhs.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.lhs.getAlias()}_${this.operator}_${this.rhs.getAlias()}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new ArithmeticExpressionImpl(this.operator, this.lhs, this.rhs);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class ComparisonExpressionImpl extends ExpressionImpl {
  constructor(
    private operator: ComparisonOperator,
    private lhs: ExpressionImpl,
    private rhs: ExpressionImpl,
  ) {
    super();
  }

  toJSON(): ComparisonExpression {
    return {
      type: this.operator,
      lhs: this.lhs.toJSON(),
      rhs: this.rhs.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.lhs.getAlias()}_${this.operator}_${this.rhs.getAlias()}`;
  }

  protected clone(): ComparisonExpressionImpl {
    const cloned = new ComparisonExpressionImpl(this.operator, this.lhs, this.rhs);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class LogicalExpressionImpl extends ExpressionImpl {
  constructor(
    private operator: 'and' | 'or' | 'not',
    private operands: ExpressionImpl[],
  ) {
    super();
  }

  toJSON(): NotExpression | BooleanLogicExpression {
    if (this.operator === 'not') {
      return {
        type: 'not',
        value: this.operands[0].toJSON(),
      };
    }
    return {
      type: this.operator,
      operands: this.operands.map((op) => op.toJSON()),
    };
  }

  getAlias(): string {
    if (this._alias) return this._alias;
    if (this.operator === 'not') {
      return `not_${this.operands[0].getAlias()}`;
    }
    return this.operands.map((op) => op.getAlias()).join(`_${this.operator}_`);
  }

  protected clone(): ExpressionImpl {
    const cloned = new LogicalExpressionImpl(this.operator, this.operands);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class UnaryArithmeticExpressionImpl extends ExpressionImpl {
  constructor(
    private operator: UnaryArithmeticOperator,
    private value: ExpressionImpl,
  ) {
    super();
  }

  toJSON(): UnaryArithmeticExpression {
    return {
      type: this.operator,
      value: this.value.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.operator}_${this.value.getAlias()}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new UnaryArithmeticExpressionImpl(this.operator, this.value);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class NullCheckExpressionImpl extends ExpressionImpl {
  constructor(
    private operator: 'is_na' | 'is_not_na',
    private value: ExpressionImpl,
  ) {
    super();
  }

  toJSON(): Expression {
    return {
      type: this.operator,
      value: this.value.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.value.getAlias()}_${this.operator}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new NullCheckExpressionImpl(this.operator, this.value);
    cloned._alias = this._alias;
    return cloned;
  }
}

export type LiteralValue = string | number | boolean | null;

export class LiteralExpressionImpl extends ExpressionImpl {
  constructor(private value: LiteralValue) {
    super();
  }

  toJSON(): ConstantValueExpression {
    return {
      type: 'const',
      value: this.value,
    };
  }

  getAlias(): string {
    return this._alias || this.generateDefaultAlias();
  }

  protected clone(): ExpressionImpl {
    const cloned = new LiteralExpressionImpl(this.value);
    cloned._alias = this._alias;
    return cloned;
  }

  /**
   * Get the literal value
   */
  getValue(): string | number | boolean | null {
    return this.value;
  }

  /**
   * Generate a default alias based on the value
   */
  private generateDefaultAlias(): string {
    if (this.value === null || this.value === undefined) {
      return 'null';
    }
    if (typeof this.value === 'string') {
      // For string values, truncate if too long and make safe for column names
      const safe = this.value.replace(/[^a-zA-Z0-9_]/g, '_');
      return safe.length > 20 ? safe.substring(0, 17) + '...' : safe;
    }
    if (typeof this.value === 'boolean') {
      return this.value ? 'true' : 'false';
    }
    if (typeof this.value === 'number') {
      return String(this.value);
    }
    if (Array.isArray(this.value)) {
      return 'array';
    }
    if (typeof this.value === 'object') {
      return 'object';
    }
    return 'literal';
  }
}

export class FillNullExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private fillValue: ExpressionImpl) {
    super();
  }

  toJSON(): FillNullExpression {
    return {
      type: 'fill_null',
      input: this.expr.toJSON(),
      fillValue: this.fillValue.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_fill_null`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new FillNullExpressionImpl(this.expr, this.fillValue);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class FillNaNExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private fillValue: ExpressionImpl) {
    super();
  }

  toJSON(): FillNaNExpression {
    return {
      type: 'fill_nan',
      input: this.expr.toJSON(),
      fillValue: this.fillValue.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_fill_nan`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new FillNaNExpressionImpl(this.expr, this.fillValue);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class StringConcatExpressionImpl extends ExpressionImpl {
  constructor(private operands: ExpressionImpl[], private delimiter: string = '') {
    super();
  }

  toJSON(): StringJoinExpression {
    return {
      type: 'str_join',
      operands: this.operands.map((o) => o.toJSON()),
      delimiter: this.delimiter,
    };
  }

  getAlias(): string {
    return this._alias || this.operands.map((o) => o.getAlias()).join('_');
  }

  protected clone(): ExpressionImpl {
    const cloned = new StringConcatExpressionImpl(this.operands);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class SubstringExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private start: number, private length?: number) {
    super();
  }

  toJSON(): SubstringExpression {
    return {
      type: 'substring',
      value: this.expr.toJSON(),
      start: { type: 'const', value: this.start },
      length: this.length !== undefined ? { type: 'const', value: this.length } : undefined,
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_substring`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new SubstringExpressionImpl(this.expr, this.start, this.length);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class StringReplaceExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private pattern: string, private value: string, private options?: Pick<StringReplaceExpression, 'replaceAll' | 'literal'>) {
    super();
  }

  toJSON(): StringReplaceExpression {
    return {
      type: 'str_replace',
      value: this.expr.toJSON(),
      pattern: this.pattern,
      replacement: this.value,
      replaceAll: this.options?.replaceAll || false,
      literal: this.options?.literal || false,
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_replace`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new StringReplaceExpressionImpl(this.expr, this.pattern, this.value, this.options);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class StringContainsExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private pattern: ExpressionImpl, private literal?: boolean, private strict?: boolean) {
    super();
  }

  toJSON(): StringContainsExpression {
    return {
      type: 'str_contains',
      value: this.expr.toJSON(),
      pattern: this.pattern.toJSON(),
      literal: this.literal || false,
      strict: this.strict !== undefined ? this.strict : true,
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_contains`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new StringContainsExpressionImpl(this.expr, this.pattern, this.literal, this.strict);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class StringCaseExpressionImpl extends ExpressionImpl {
  constructor(private operation: 'to_upper' | 'to_lower', private expr: ExpressionImpl) {
    super();
  }

  toJSON(): ExtendedUnaryStringExpression {
    return {
      type: this.operation,
      value: this.expr.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_${this.operation}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new StringCaseExpressionImpl(this.operation, this.expr);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class StringStartsWithExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private pattern: ExpressionImpl) {
    super();
  }

  toJSON(): Expression {
    return {
      type: 'str_starts_with',
      value: this.expr.toJSON(),
      prefix: this.pattern.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_starts_with`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new StringStartsWithExpressionImpl(this.expr, this.pattern);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class StringEndsWithExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private pattern: ExpressionImpl) {
    super();
  }

  toJSON(): Expression {
    return {
      type: 'str_ends_with',
      value: this.expr.toJSON(),
      suffix: this.pattern.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_ends_with`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new StringEndsWithExpressionImpl(this.expr, this.pattern);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class CumsumExpressionImpl extends ExpressionImpl {
  constructor(private value: ExpressionImpl, private additionalOrderBy: ExpressionImpl[] = [], private partitionBy: ExpressionImpl[] = [], private descending?: boolean) {
    super();
  }

  toJSON(): CumsumExpression {
    return {
      type: 'cumsum',
      value: this.value.toJSON(),
      additionalOrderBy: this.additionalOrderBy.map((expr) => expr.toJSON()),
      partitionBy: this.partitionBy.map((expr) => expr.toJSON()),
      descending: this.descending,
    };
  }

  getAlias(): string {
    return this._alias || `cumsum_${this.value.getAlias()}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new CumsumExpressionImpl(this.value, this.additionalOrderBy, this.partitionBy, this.descending);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class AggregationExpressionImpl extends ExpressionImpl {
  constructor(public operation: AggregationType, public expr?: ExpressionImpl) {
    super();
  }

  toJSON(): WindowExpression {
    return {
      type: 'aggregate',
      aggregation: this.operation,
      value: this.expr?.toJSON() || { type: 'const', value: 1 },
      partitionBy: [],
    };
  }

  getAlias(): string {
    return this._alias || `${this.operation}${this.expr ? '_' + this.expr.getAlias() : ''}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new AggregationExpressionImpl(this.operation, this.expr);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class WindowExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private aggregation: AggregationType, private partitionBy: ExpressionImpl[]) {
    super();
  }

  toJSON(): WindowExpression {
    return {
      type: 'aggregate',
      aggregation: this.aggregation,
      value: this.expr.toJSON(),
      partitionBy: this.partitionBy.map((expr) => expr.toJSON()),
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_window`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new WindowExpressionImpl(this.expr, this.aggregation, this.partitionBy);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class StringDistanceExpressionImpl extends ExpressionImpl {
  constructor(private string1: ExpressionImpl, private string2: ExpressionImpl, private metric: StringDistanceMetric, private returnSimilarity?: boolean) {
    super();
  }

  toJSON(): StringDistanceExpression {
    return {
      type: 'string_distance',
      metric: this.metric,
      string1: this.string1.toJSON(),
      string2: this.string2.toJSON(),
      returnSimilarity: this.returnSimilarity || false,
    };
  }

  getAlias(): string {
    return this._alias || `${this.string1.getAlias()}_distance_${this.string2.getAlias()}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new StringDistanceExpressionImpl(this.string1, this.string2, this.metric, this.returnSimilarity);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class FuzzyStringFilterExpressionImpl extends ExpressionImpl {
  constructor(private expr: ExpressionImpl, private pattern: ExpressionImpl, private metric: FuzzyFilterDistanceMetric, private bound: number) {
    super();
  }

  toJSON(): FuzzyStringFilterExpression {
    return {
      type: 'fuzzy_string_filter',
      metric: this.metric,
      value: this.expr.toJSON(),
      pattern: this.pattern.toJSON(),
      bound: this.bound,
    };
  }

  getAlias(): string {
    return this._alias || `${this.expr.getAlias()}_fuzzy_filter`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new FuzzyStringFilterExpressionImpl(this.expr, this.pattern, this.metric, this.bound);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class RankExpressionImpl extends ExpressionImpl {
  constructor(
    private readonly orderBy: ExpressionImpl[],
    private readonly partitionBy: ExpressionImpl[],
    private readonly descending: boolean,
  ) {
    super();
  }

  toJSON(): RankExpression {
    return {
      type: 'rank',
      orderBy: this.orderBy.map((e) => e.toJSON()),
      partitionBy: this.partitionBy.map((e) => e.toJSON()),
      descending: this.descending || undefined,
    };
  }

  getAlias(): string {
    const order = this.orderBy.map((e) => e.getAlias()).join('_');
    const part = this.partitionBy.map((e) => e.getAlias()).join('_');
    const dir = this.descending ? 'desc' : 'asc';
    return this._alias || `rank_${order}${part ? `_over_${part}` : ''}_${dir}`;
  }

  protected clone(): ExpressionImpl {
    const cloned = new RankExpressionImpl(this.orderBy, this.partitionBy, this.descending);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class WhenThenOtherwiseExpressionImpl extends ExpressionImpl {
  constructor(
    private conditions: Array<{ when: ExpressionImpl; then: ExpressionImpl }>,
    private otherwiseValue: ExpressionImpl,
  ) {
    super();
  }

  toJSON(): WhenThenOtherwiseExpression {
    return {
      type: 'when_then_otherwise',
      conditions: this.conditions.map((clause) => ({
        when: clause.when.toJSON(),
        then: clause.then.toJSON(),
      })),
      otherwise: this.otherwiseValue.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || 'conditional';
  }

  protected clone(): ExpressionImpl {
    const cloned = new WhenThenOtherwiseExpressionImpl(this.conditions, this.otherwiseValue);
    cloned._alias = this._alias;
    return cloned;
  }
}
