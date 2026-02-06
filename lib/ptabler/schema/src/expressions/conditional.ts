import type { Expression } from "./base";

/**
 * Represents a single "when" condition and its corresponding "then" result expression.
 * Used within the WhenThenOtherwiseExpression.
 */
export interface WhenThenClause {
  /** The condition expression. Should evaluate to a boolean. */
  when: Expression;
  /** The result expression if the 'when' condition is true. */
  then: Expression;
}

/**
 * Represents a conditional expression that evaluates a series of "when"
 * conditions and returns the corresponding "then" expression's value.
 * If no "when" condition is met, it returns the value of the "otherwise" expression.
 * This mimics Polars' when/then/otherwise functionality.
 */
export interface WhenThenOtherwiseExpression {
  /** The type of operation, always 'when_then_otherwise'. */
  type: "when_then_otherwise";
  /** An array of "when/then" clauses to be evaluated in order. */
  conditions: WhenThenClause[];
  /** The expression whose value is returned if none of the "when" conditions are met. */
  otherwise: Expression;
}

/**
 * Represents a fill null operation.
 * If the 'input' expression evaluates to null, the 'fillValue' expression is used.
 * Otherwise, the 'input' expression's value is used.
 * This is a convenience shortcut for a common pattern often implemented with
 * conditional expressions (e.g., when(is_null(input), fillValue).otherwise(input)).
 */
export interface FillNullExpression {
  /** The type of operation, always 'fill_null'. */
  type: "fill_null";
  /** The primary expression to evaluate. */
  input: Expression;
  /** The expression whose value is used if 'input' is null. */
  fillValue: Expression;
}

/**
 * Represents a fill NaN operation.
 * If the 'input' expression evaluates to NaN, the 'fillValue' expression is used.
 * Otherwise, the 'input' expression's value is used.
 * This is a convenience shortcut for a common pattern often implemented with
 * conditional expressions (e.g., when(is_nan(input), fillValue).otherwise(input)).
 */
export interface FillNaNExpression {
  /** The type of operation, always 'fill_nan'. */
  type: "fill_nan";
  /** The primary expression to evaluate. */
  input: Expression;
  /** The expression whose value is used if 'input' is NaN. */
  fillValue: Expression;
}
