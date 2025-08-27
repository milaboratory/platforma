/**
 * Base expression classes and interfaces for PTabler JavaScript implementation
 */

import type {
  FuzzyFilterOptions,
  Expression as SchemaExpression,
  StringDistanceOptions,
  StringReplaceOptions,
  SubstringOptions,
  WindowOptions,
} from '../types';

/**
 * Base abstract class for all expressions
 */
export abstract class Expression {
  protected _alias?: string;

  /**
   * Convert the expression to JSON format compatible with PTabler schema
   */
  abstract toJSON(): SchemaExpression;

  /**
   * Get the alias for this expression (defaults to a generated name)
   */
  abstract getAlias(): string;

  /**
   * Set an alias for this expression
   */
  alias(name: string): Expression {
    const cloned = this.clone();
    cloned._alias = name;
    return cloned;
  }

  /**
   * Clone this expression
   */
  protected abstract clone(): Expression;

  // Arithmetic operations
  plus(other: Expression | number | string): ArithmeticExpression {
    return new ArithmeticExpression('plus', this, coerceToExpression(other));
  }

  minus(other: Expression | number | string): ArithmeticExpression {
    return new ArithmeticExpression('minus', this, coerceToExpression(other));
  }

  multiply(other: Expression | number | string): ArithmeticExpression {
    return new ArithmeticExpression('multiply', this, coerceToExpression(other));
  }

  truediv(other: Expression | number | string): ArithmeticExpression {
    return new ArithmeticExpression('truediv', this, coerceToExpression(other));
  }

  floordiv(other: Expression | number | string): ArithmeticExpression {
    return new ArithmeticExpression('floordiv', this, coerceToExpression(other));
  }

  // Comparison operations
  gt(other: Expression | number | string): ComparisonExpression {
    return new ComparisonExpression('gt', this, coerceToExpression(other));
  }

  ge(other: Expression | number | string): ComparisonExpression {
    return new ComparisonExpression('ge', this, coerceToExpression(other));
  }

  eq(other: Expression | number | string): ComparisonExpression {
    return new ComparisonExpression('eq', this, coerceToExpression(other));
  }

  lt(other: Expression | number | string): ComparisonExpression {
    return new ComparisonExpression('lt', this, coerceToExpression(other));
  }

  le(other: Expression | number | string): ComparisonExpression {
    return new ComparisonExpression('le', this, coerceToExpression(other));
  }

  neq(other: Expression | number | string): ComparisonExpression {
    return new ComparisonExpression('neq', this, coerceToExpression(other));
  }

  // Logical operations
  and(...others: Expression[]): LogicalExpression {
    return new LogicalExpression('and', [this, ...others]);
  }

  or(...others: Expression[]): LogicalExpression {
    return new LogicalExpression('or', [this, ...others]);
  }

  not(): LogicalExpression {
    return new LogicalExpression('not', [this]);
  }

  // Unary arithmetic operations
  abs(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('abs', this);
  }

  sqrt(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('sqrt', this);
  }

  log(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('log', this);
  }

  log10(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('log10', this);
  }

  log2(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('log2', this);
  }

  floor(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('floor', this);
  }

  ceil(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('ceil', this);
  }

  round(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('round', this);
  }

  negate(): UnaryArithmeticExpression {
    return new UnaryArithmeticExpression('negate', this);
  }

  // Null checks
  isNull(): NullCheckExpression {
    return new NullCheckExpression('is_na', this);
  }

  isNotNull(): NullCheckExpression {
    return new NullCheckExpression('is_not_na', this);
  }

  // Fill null/NaN
  fillNull(value: Expression): FillNullExpression {
    return new FillNullExpression(this, coerceToExpression(value));
  }

  fillNaN(value: Expression): FillNaNExpression {
    return new FillNaNExpression(this, coerceToExpression(value));
  }

  // String operations
  strConcat(other: Expression | string): StringConcatExpression {
    return new StringConcatExpression(this, coerceToExpression(other));
  }

  substring(options: SubstringOptions): SubstringExpression {
    return new SubstringExpression(this, options.start, options.length);
  }

  strReplace(options: StringReplaceOptions): StringReplaceExpression {
    return new StringReplaceExpression(this, options.pattern, options.value, options);
  }

  strContains(pattern: Expression | string): StringContainsExpression {
    return new StringContainsExpression(this, coerceToExpression(pattern));
  }

  strToUpper(): StringCaseExpression {
    return new StringCaseExpression('upper', this);
  }

  strToLower(): StringCaseExpression {
    return new StringCaseExpression('lower', this);
  }

  strStartsWith(pattern: Expression | string): StringStartsWithExpression {
    return new StringStartsWithExpression(this, coerceToExpression(pattern));
  }

  strEndsWith(pattern: Expression | string): StringEndsWithExpression {
    return new StringEndsWithExpression(this, coerceToExpression(pattern));
  }

  // Aggregation operations
  sum(): AggregationExpression {
    return new AggregationExpression('sum', this);
  }

  mean(): AggregationExpression {
    return new AggregationExpression('mean', this);
  }

  count(): AggregationExpression {
    return new AggregationExpression('count', this);
  }

  min(): AggregationExpression {
    return new AggregationExpression('min', this);
  }

  max(): AggregationExpression {
    return new AggregationExpression('max', this);
  }

  first(): AggregationExpression {
    return new AggregationExpression('first', this);
  }

  last(): AggregationExpression {
    return new AggregationExpression('last', this);
  }

  // Window operations
  over(partitionBy?: string | string[], orderBy?: string | string[]): WindowExpression {
    return new WindowExpression(this, { partitionBy, orderBy });
  }

  cumsum(): WindowExpression {
    return new WindowExpression(new AggregationExpression('cumsum', this));
  }

  // Fuzzy operations
  stringDistance(other: Expression | string, options: StringDistanceOptions): StringDistanceExpression {
    return new StringDistanceExpression(
      this,
      coerceToExpression(other),
      options.metric,
      options.returnSimilarity,
    );
  }

  fuzzyStringFilter(pattern: Expression | string, options: FuzzyFilterOptions): FuzzyStringFilterExpression {
    return new FuzzyStringFilterExpression(
      this,
      coerceToExpression(pattern),
      options.metric,
      options.bound,
    );
  }
}

/**
 * Helper function to coerce values to expressions
 */
export function coerceToExpression(value: Expression | LiteralValue): Expression {
  if (value instanceof Expression) {
    return value;
  }
  return new LiteralExpression(value);
}

// Forward declarations for concrete expression classes
// These will be imported from their respective modules
export class ArithmeticExpression extends Expression {
  constructor(
    private operator: string,
    private lhs: Expression,
    private rhs: Expression,
  ) {
    super();
  }

  toJSON(): SchemaExpression {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      type: this.operator as any,
      lhs: this.lhs.toJSON(),
      rhs: this.rhs.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.lhs.getAlias()}_${this.operator}_${this.rhs.getAlias()}`;
  }

  protected clone(): Expression {
    const cloned = new ArithmeticExpression(this.operator, this.lhs, this.rhs);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class ComparisonExpression extends Expression {
  constructor(
    private operator: string,
    private lhs: Expression,
    private rhs: Expression,
  ) {
    super();
  }

  toJSON(): SchemaExpression {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      type: this.operator as any,
      lhs: this.lhs.toJSON(),
      rhs: this.rhs.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.lhs.getAlias()}_${this.operator}_${this.rhs.getAlias()}`;
  }

  protected clone(): Expression {
    const cloned = new ComparisonExpression(this.operator, this.lhs, this.rhs);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class LogicalExpression extends Expression {
  constructor(
    private operator: 'and' | 'or' | 'not',
    private operands: Expression[],
  ) {
    super();
  }

  toJSON(): SchemaExpression {
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

  protected clone(): Expression {
    const cloned = new LogicalExpression(this.operator, this.operands);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class UnaryArithmeticExpression extends Expression {
  constructor(
    private operator: string,
    private value: Expression,
  ) {
    super();
  }

  toJSON(): SchemaExpression {
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      type: this.operator as any,
      value: this.value.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.operator}_${this.value.getAlias()}`;
  }

  protected clone(): Expression {
    const cloned = new UnaryArithmeticExpression(this.operator, this.value);
    cloned._alias = this._alias;
    return cloned;
  }
}

export class NullCheckExpression extends Expression {
  constructor(
    private operator: 'is_na' | 'is_not_na',
    private value: Expression,
  ) {
    super();
  }

  toJSON(): SchemaExpression {
    return {
      type: this.operator,
      value: this.value.toJSON(),
    };
  }

  getAlias(): string {
    return this._alias || `${this.value.getAlias()}_${this.operator}`;
  }

  protected clone(): Expression {
    const cloned = new NullCheckExpression(this.operator, this.value);
    cloned._alias = this._alias;
    return cloned;
  }
}

export type LiteralValue = string | number | boolean | null;

// Placeholder classes - these will be properly implemented in their respective modules
export class LiteralExpression extends Expression {
  constructor(private value: LiteralValue) {
    super();
  }

  toJSON(): SchemaExpression {
    return { type: 'const', value: this.value };
  }

  getAlias(): string {
    return this._alias || String(this.value);
  }

  protected clone(): Expression {
    const cloned = new LiteralExpression(this.value);
    cloned._alias = this._alias;
    return cloned;
  }
}

// More placeholder classes - will be properly implemented
export class FillNullExpression extends Expression {
  constructor(private expr: Expression, private fillValue: Expression) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_fill_null`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class FillNaNExpression extends Expression {
  constructor(private expr: Expression, private fillValue: Expression) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_fill_nan`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class StringConcatExpression extends Expression {
  constructor(private lhs: Expression, private rhs: Expression) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.lhs.getAlias()}_concat_${this.rhs.getAlias()}`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class SubstringExpression extends Expression {
  constructor(private expr: Expression, private start: number, private length?: number) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_substring`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class StringReplaceExpression extends Expression {
  constructor(private expr: Expression, private pattern: string, private value: string, private options?: StringReplaceOptions) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_replace`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class StringContainsExpression extends Expression {
  constructor(private expr: Expression, private pattern: Expression) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_contains`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class StringCaseExpression extends Expression {
  constructor(private operation: 'upper' | 'lower', private expr: Expression) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_${this.operation}`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class StringStartsWithExpression extends Expression {
  constructor(private expr: Expression, private pattern: Expression) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_starts_with`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class StringEndsWithExpression extends Expression {
  constructor(private expr: Expression, private pattern: Expression) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_ends_with`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class AggregationExpression extends Expression {
  constructor(private operation: string, private expr?: Expression) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.operation}${this.expr ? '_' + this.expr.getAlias() : ''}`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class WindowExpression extends Expression {
  constructor(private expr: Expression, private options?: WindowOptions) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_window`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class StringDistanceExpression extends Expression {
  constructor(private expr: Expression, private other: Expression, private metric: string, private returnSimilarity?: boolean) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_distance_${this.other.getAlias()}`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}

export class FuzzyStringFilterExpression extends Expression {
  constructor(private expr: Expression, private pattern: Expression, private metric: string, private bound: number) { super(); }
  toJSON(): SchemaExpression { throw new Error('Not implemented'); }
  getAlias(): string { return this._alias || `${this.expr.getAlias()}_fuzzy_filter`; }
  protected clone(): Expression { throw new Error('Not implemented'); }
}
