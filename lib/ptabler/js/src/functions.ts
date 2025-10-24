/**
 * Factory functions for creating expressions - mirrors Tengo pt library API
 */

import type { LiteralValue } from './expressions';
import { ColumnExpressionImpl, ExpressionImpl, LiteralExpressionImpl, LogicalExpressionImpl, MinMaxExpressionImpl, RankExpressionImpl, StringConcatExpressionImpl, WhenThenOtherwiseExpressionImpl } from './expressions';

// Internal helpers mirroring Tengo behavior
function isExpression(v: unknown): v is ExpressionImpl {
  return v instanceof ExpressionImpl;
}

function asExprFromString(value: string, interpretation: 'col' | 'lit'): ExpressionImpl {
  return interpretation === 'col' ? col(value) : lit(value);
}

function coerceToExpressionList(
  items: Array<ExpressionImpl | string> | ExpressionImpl | string,
  interpretationForString: 'col' | 'lit',
): ExpressionImpl[] {
  const arr = Array.isArray(items) ? items : [items];
  return arr.map((it) => (typeof it === 'string' ? asExprFromString(it, interpretationForString) : it));
}

/**
 * Create a column reference expression
 * @param name Column name
 */
export function col(name: string): ColumnExpressionImpl {
  return new ColumnExpressionImpl(name);
}

/**
 * Create a literal value expression
 * @param value Literal value (number, string, boolean, null, etc.)
 */
export function lit(value: LiteralValue): LiteralExpressionImpl {
  return new LiteralExpressionImpl(value);
}

/**
 *  Create an AND expression with multiple operands (horizontal AND)
 * @param expressions Array of expressions to AND together
 */
export function allHorizontal(...expressions: Array<ExpressionImpl | string>): LogicalExpressionImpl {
  // Interpret string args as column names. We don't flatten nested ANDs to keep implementation simple.
  const processed: ExpressionImpl[] = expressions.map((e) => (typeof e === 'string' ? col(e) : e));
  return new LogicalExpressionImpl('and', processed);
}

/**
 * Create an OR expression with multiple operands (horizontal OR)
 * @param expressions Array of expressions to OR together
 */
export function anyHorizontal(...expressions: Array<ExpressionImpl | string>): LogicalExpressionImpl {
  // Interpret string args as column names. We don't flatten nested ORs to keep implementation simple.
  const processed: ExpressionImpl[] = expressions.map((e) => (typeof e === 'string' ? col(e) : e));
  return new LogicalExpressionImpl('or', processed);
}

/**
 * Create an AND expression with multiple operands
 * @param expressions Array of expressions to AND together
 */
export function and(...expressions: Array<ExpressionImpl | string>): LogicalExpressionImpl {
  return allHorizontal(...expressions);
}

/**
 * Create an OR expression with multiple operands
 * @param expressions Array of expressions to OR together
 */
export function or(...expressions: Array<ExpressionImpl | string>): LogicalExpressionImpl {
  return anyHorizontal(...expressions);
}

/**
 * Concatenate string representations with optional delimiter (Tengo: concatStr)
 * String inputs are treated as literals.
 */
export function concatStr(
  expressions: Array<ExpressionImpl | string>,
  options?: { delimiter?: string },
): ExpressionImpl {
  if (!Array.isArray(expressions) || expressions.length === 0) {
    throw new Error('concatStr requires a non-empty array of expressions');
  }
  const ops = coerceToExpressionList(expressions, 'lit');
  const delimiter = options?.delimiter ?? '';
  return new StringConcatExpressionImpl(ops, delimiter);
}

/**
 * Element-wise min across expressions (Tengo: minHorizontal). Strings -> columns.
 */
export function minHorizontal(expressions: Array<ExpressionImpl | string>): ExpressionImpl {
  if (!Array.isArray(expressions) || expressions.length === 0) {
    throw new Error('minHorizontal requires a non-empty array of expressions');
  }

  const ops = coerceToExpressionList(expressions, 'col');
  return new MinMaxExpressionImpl('min', ops);
}

/**
 * Element-wise max across expressions (Tengo: maxHorizontal). Strings -> columns.
 */
export function maxHorizontal(expressions: Array<ExpressionImpl | string>): ExpressionImpl {
  if (!Array.isArray(expressions) || expressions.length === 0) {
    throw new Error('maxHorizontal requires a non-empty array of expressions');
  }
  const ops = coerceToExpressionList(expressions, 'col');
  return new MinMaxExpressionImpl('max', ops);
}

/**
 * Create a conditional when-then expression builder
 * @param condition Boolean expression condition
 */
export function when(condition: ExpressionImpl): WhenThenBuilder {
  return WhenThenBuilder.start(condition);
}

/**
 * Create a rank expression
 * @param expression Expression to rank
 * @param options Ranking options
 */
export function rank(orderBy: ExpressionImpl | string | Array<ExpressionImpl | string>, descending = false): RankBuilder {
  const orderByList = coerceToExpressionList(orderBy, 'col');
  return new RankBuilder(orderByList, descending);
}

/**
 * Builder class for when-then-otherwise conditional expressions
 */
export class WhenThenBuilder {
  private constructor(
    private readonly clauses: Array<{ when: ExpressionImpl; then: ExpressionImpl }>,
    private readonly currentWhen?: ExpressionImpl,
  ) {}

  static start(condition: ExpressionImpl): WhenThenBuilder {
    if (!isExpression(condition)) throw new Error('when() expects an Expression');
    return new WhenThenBuilder([], condition);
  }

  when(condition: ExpressionImpl): WhenThenBuilder {
    if (this.currentWhen) throw new Error('.when() must follow a .then()');
    if (!isExpression(condition)) throw new Error('.when() expects an Expression');
    return new WhenThenBuilder(this.clauses, condition);
  }

  then(value: ExpressionImpl | LiteralValue): WhenThenBuilder {
    if (!this.currentWhen) throw new Error('.then() must follow a .when()');
    const expr = isExpression(value) ? value : lit(value);
    const nextClauses = this.clauses.slice();
    nextClauses.push({ when: this.currentWhen, then: expr });
    return new WhenThenBuilder(nextClauses, undefined);
  }

  otherwise(value: ExpressionImpl | LiteralValue): WhenThenOtherwiseExpressionImpl {
    if (this.currentWhen) throw new Error('.otherwise() must follow a .then()');
    if (this.clauses.length === 0) {
      throw new Error('At least one .when().then() clause is required before .otherwise()');
    }
    const expr = isExpression(value) ? value : lit(value);
    return new WhenThenOtherwiseExpressionImpl(this.clauses, expr);
  }
}

// Rank builder and expression
export class RankBuilder {
  constructor(
    private readonly orderBy: ExpressionImpl[],
    private readonly descending: boolean,
  ) {}

  over(partitionBy: ExpressionImpl | string | Array<ExpressionImpl | string>): RankExpressionImpl {
    const partitionByList = coerceToExpressionList(partitionBy, 'col');
    return new RankExpressionImpl(this.orderBy, partitionByList, this.descending);
  }
}
