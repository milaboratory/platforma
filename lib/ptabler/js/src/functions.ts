/**
 * Factory functions for creating expressions - mirrors Tengo pt library API
 */

import type { LiteralValue } from './expressions/base';
import { Expression, LogicalExpression } from './expressions/base';
import { ColumnExpression } from './expressions/column';
import { LiteralExpression } from './expressions/literal';
import type * as Types from './types';

// Internal helpers mirroring Tengo behavior
function isExpression(v: unknown): v is Expression {
  return v instanceof Expression;
}

function asExprFromString(value: string, interpretation: 'col' | 'lit'): Expression {
  return interpretation === 'col' ? col(value) : lit(value);
}

function coerceToExpressionList(
  items: Array<Expression | string> | Expression | string,
  interpretationForString: 'col' | 'lit',
): Expression[] {
  const arr = Array.isArray(items) ? items : [items];
  return arr.map((it) => (typeof it === 'string' ? asExprFromString(it, interpretationForString) : it));
}

/**
 * Create a column reference expression
 * @param name Column name
 */
export function col(name: string): ColumnExpression {
  return new ColumnExpression(name);
}

/**
 * Create a literal value expression
 * @param value Literal value (number, string, boolean, null, etc.)
 */
export function lit(value: LiteralValue): LiteralExpression {
  return new LiteralExpression(value);
}

/**
 *  Create an AND expression with multiple operands (horizontal AND)
 * @param expressions Array of expressions to AND together
 */
export function allHorizontal(...expressions: Array<Expression | string>): LogicalExpression {
  // Interpret string args as column names. We don't flatten nested ANDs to keep implementation simple.
  const processed: Expression[] = expressions.map((e) => (typeof e === 'string' ? col(e) : e));
  return new LogicalExpression('and', processed);
}

/**
 * Create an OR expression with multiple operands (horizontal OR)
 * @param expressions Array of expressions to OR together
 */
export function anyHorizontal(...expressions: Array<Expression | string>): LogicalExpression {
  // Interpret string args as column names. We don't flatten nested ORs to keep implementation simple.
  const processed: Expression[] = expressions.map((e) => (typeof e === 'string' ? col(e) : e));
  return new LogicalExpression('or', processed);
}

/**
 * Create an AND expression with multiple operands
 * @param expressions Array of expressions to AND together
 */
export function and(...expressions: Array<Expression | string>): LogicalExpression {
  return allHorizontal(...expressions);
}

/**
 * Create an OR expression with multiple operands
 * @param expressions Array of expressions to OR together
 */
export function or(...expressions: Array<Expression | string>): LogicalExpression {
  return anyHorizontal(...expressions);
}

/**
 * Concatenate string representations with optional delimiter (Tengo: concatStr)
 * String inputs are treated as literals.
 */
export function concatStr(
  expressions: Array<Expression | string>,
  options?: { delimiter?: string },
): Expression {
  if (!Array.isArray(expressions) || expressions.length === 0) {
    throw new Error('concatStr requires a non-empty array of expressions');
  }
  class StringJoinExpression extends Expression {
    constructor(private ops: Expression[], private delimiter: string) {
      super();
    }

    toJSON(): Types.Expression {
      return {
        type: 'str_join',
        operands: this.ops.map((o) => o.toJSON()),
        delimiter: this.delimiter,
      } as unknown as Types.Expression;
    }

    getAlias(): string {
      return this._alias || `join_${this.ops.length}`;
    }

    protected clone(): Expression {
      const cloned = new StringJoinExpression(this.ops, this.delimiter);
      cloned._alias = this._alias;
      return cloned;
    }
  }
  const ops = coerceToExpressionList(expressions, 'lit');
  const delimiter = options?.delimiter ?? '';
  return new StringJoinExpression(ops, delimiter);
}

/**
 * Element-wise min across expressions (Tengo: minHorizontal). Strings -> columns.
 */
export function minHorizontal(expressions: Array<Expression | string>): Expression {
  if (!Array.isArray(expressions) || expressions.length === 0) {
    throw new Error('minHorizontal requires a non-empty array of expressions');
  }
  class MinMaxExpression extends Expression {
    constructor(private op: 'min' | 'max', private ops: Expression[]) {
      super();
    }

    toJSON(): Types.Expression {
      return {
        type: this.op,
        operands: this.ops.map((o) => o.toJSON()),
      } as unknown as Types.Expression;
    }

    getAlias(): string {
      return this._alias || `${this.op}_${this.ops.map((o) => o.getAlias()).join('_')}`;
    }

    protected clone(): Expression {
      const cloned = new MinMaxExpression(this.op, this.ops);
      cloned._alias = this._alias;
      return cloned;
    }
  }
  const ops = coerceToExpressionList(expressions, 'col');
  return new MinMaxExpression('min', ops);
}

/**
 * Element-wise max across expressions (Tengo: maxHorizontal). Strings -> columns.
 */
export function maxHorizontal(expressions: Array<Expression | string>): Expression {
  if (!Array.isArray(expressions) || expressions.length === 0) {
    throw new Error('maxHorizontal requires a non-empty array of expressions');
  }
  class MinMaxExpression extends Expression {
    constructor(private op: 'min' | 'max', private ops: Expression[]) {
      super();
    }

    toJSON(): Types.Expression {
      return {
        type: this.op,
        operands: this.ops.map((o) => o.toJSON()),
      } as unknown as Types.Expression;
    }

    getAlias(): string {
      return this._alias || `${this.op}_${this.ops.map((o) => o.getAlias()).join('_')}`;
    }

    protected clone(): Expression {
      const cloned = new MinMaxExpression(this.op, this.ops);
      cloned._alias = this._alias;
      return cloned;
    }
  }
  const ops = coerceToExpressionList(expressions, 'col');
  return new MinMaxExpression('max', ops);
}

/**
 * Create a conditional when-then expression builder
 * @param condition Boolean expression condition
 */
export function when(condition: Expression): WhenThenBuilder {
  return WhenThenBuilder.start(condition);
}

/**
 * Create a rank expression
 * @param expression Expression to rank
 * @param options Ranking options
 */
export function rank(orderBy: Expression | string | Array<Expression | string>, options?: Types.RankOptions): RankBuilder {
  const orderByList = coerceToExpressionList(orderBy, 'col');
  const descending = options?.descending ?? false;
  return new RankBuilder(orderByList, descending);
}

/**
 * Builder class for when-then-otherwise conditional expressions
 */
export class WhenThenBuilder {
  private constructor(
    private readonly clauses: Array<{ when: Expression; then: Expression }>,
    private readonly currentWhen?: Expression,
  ) {}

  static start(condition: Expression): WhenThenBuilder {
    if (!isExpression(condition)) throw new Error('when() expects an Expression');
    return new WhenThenBuilder([], condition);
  }

  when(condition: Expression): WhenThenBuilder {
    if (this.currentWhen) throw new Error('.when() must follow a .then()');
    if (!isExpression(condition)) throw new Error('.when() expects an Expression');
    return new WhenThenBuilder(this.clauses, condition);
  }

  then(value: Expression | LiteralValue): WhenThenBuilder {
    if (!this.currentWhen) throw new Error('.then() must follow a .when()');
    const expr = isExpression(value) ? value : lit(value);
    const nextClauses = this.clauses.slice();
    nextClauses.push({ when: this.currentWhen, then: expr });
    return new WhenThenBuilder(nextClauses, undefined);
  }

  otherwise(value: Expression | LiteralValue): WhenThenOtherwiseExpression {
    if (this.currentWhen) throw new Error('.otherwise() must follow a .then()');
    if (this.clauses.length === 0) {
      throw new Error('At least one .when().then() clause is required before .otherwise()');
    }
    const expr = isExpression(value) ? value : lit(value);
    return new WhenThenOtherwiseExpression(this.clauses, expr);
  }
}

// Rank builder and expression
export class RankBuilder {
  constructor(
    private readonly orderBy: Expression[],
    private readonly descending: boolean,
  ) {}

  over(partitionBy: Expression | string | Array<Expression | string>): RankExpression {
    const partitionByList = coerceToExpressionList(partitionBy, 'col');
    return new RankExpression(this.orderBy, partitionByList, this.descending);
  }
}

export class RankExpression extends Expression {
  constructor(
    private readonly orderBy: Expression[],
    private readonly partitionBy: Expression[],
    private readonly descending: boolean,
  ) {
    super();
  }

  toJSON(): Types.RankExpression {
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

  protected clone(): Expression {
    const cloned = new RankExpression(this.orderBy, this.partitionBy, this.descending);
    cloned._alias = this._alias;
    return cloned;
  }
}

// @TODO: REIMPLEMENT
export class WhenThenOtherwiseExpression extends Expression {
  constructor(
    private conditions: Array<{ when: Expression; then: Expression }>,
    private otherwiseValue: Expression,
  ) {
    super();
  }

  toJSON(): Types.WhenThenOtherwiseExpression {
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

  protected clone(): Expression {
    const cloned = new WhenThenOtherwiseExpression(this.conditions, this.otherwiseValue);
    cloned._alias = this._alias;
    return cloned;
  }
}
