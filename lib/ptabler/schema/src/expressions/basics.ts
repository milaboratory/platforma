import type { AxisSpec } from "@milaboratories/pl-model-common";
import type { DataType } from "../common";
import type { Expression } from "./base";

/** Represents all possible comparison operator types. */
export type ComparisonOperator = "gt" | "ge" | "eq" | "lt" | "le" | "neq";

/** Defines a comparison operation between two expressions. */
export interface ComparisonExpression {
  /** The type of comparison (e.g., 'gt', 'eq'). */
  type: ComparisonOperator;
  /** The left-hand side expression. */
  lhs: Expression;
  /** The right-hand side expression. */
  rhs: Expression;
}

/** Defines the supported binary arithmetic operators. */
export type BinaryArithmeticOperator = "plus" | "minus" | "multiply" | "truediv" | "floordiv";

/** Represents a binary arithmetic operation between two expressions. */
export interface BinaryArithmeticExpression {
  /** The type of arithmetic operation (e.g., 'plus', 'minus'). */
  type: BinaryArithmeticOperator;
  /** The left-hand side expression. */
  lhs: Expression;
  /** The right-hand side expression. */
  rhs: Expression;
}

/** Defines the supported unary arithmetic operators. */
export type UnaryArithmeticOperator =
  | "log10"
  | "log"
  | "log2"
  | "abs"
  | "sqrt"
  | "negate"
  | "floor"
  | "round"
  | "ceil";

/** Represents a unary arithmetic operation on a single expression. */
export interface UnaryArithmeticExpression {
  /** The type of unary operation (e.g., 'log10', 'abs'). */
  type: UnaryArithmeticOperator;
  /** The expression to operate on. */
  value: Expression;
}

/**
 * Represents a type casting operation that converts the result of an expression to a specified data type.
 */
export interface CastExpression {
  /** The type of operation, always 'cast'. */
  type: "cast";
  /** The expression whose result will be cast to the target data type. */
  value: Expression;
  /** The target data type to cast the expression result to. */
  dtype: DataType;
  /**
   * Whether to use strict casting mode. If true, conversion errors and overflows will throw exceptions.
   * If false or undefined, uses non-strict mode where failures result in null values. Defaults to false.
   */
  strict?: boolean;
}

/** Defines the supported boolean list operators. */
export type BooleanListOperator = "and" | "or";

/** Represents a boolean logic operation (AND, OR) on a list of expressions. */
export interface BooleanLogicExpression {
  /** The type of boolean operation ('and', 'or'). */
  type: BooleanListOperator;
  /** An array of boolean expressions as operands. */
  operands: Expression[]; // Array of boolean expressions
}

/** Represents a logical NOT operation on a single boolean expression. */
export interface NotExpression {
  /** The type of operation, always 'not'. */
  type: "not";
  /** The boolean expression to negate. */
  value: Expression;
}

/** Defines the supported null check operators. */
export type NullCheckOperator = "is_na" | "is_not_na";

/** Represents a null check operation (is NA, is not NA) on an expression. */
export interface NullCheckExpression {
  /** The type of null check ('is_na', 'is_not_na'). */
  type: NullCheckOperator;
  /** The expression to check for nullity. */
  value: Expression;
}

/** Represents a reference to a column by its name. */
export interface ColumnReferenceExpression {
  /** The type of operation, always 'col'. */
  type: "col";
  /** The name of the column to reference. */
  name: string;
}

/** Represents a reference to an axis by its specification (or id). */
export interface AxisReferenceExpression {
  /** The type of operation, always 'axis'. */
  type: "axis";
  /** The axis to reference. */
  spec: AxisSpec;
}

/** Represents a constant literal value (string, number, boolean, or null). */
export interface ConstantValueExpression {
  /** The type of operation, always 'const'. */
  type: "const";
  /** The constant value. */
  value: string | number | boolean | null;
}

/** Defines the supported min/max operators. */
export type MinMaxOperator = "min" | "max";

/** Represents a min or max operation on a list of expressions. */
export interface MinMaxExpression {
  /** The type of operation ('min' or 'max'). */
  type: MinMaxOperator;
  /** An array of expressions to find the minimum or maximum value from. */
  operands: Expression[];
}

/**
 * Represents an "in set" operation.
 * Checks if the value of an expression is contained within a specified set of values.
 * Returns true if the expression's value is found in the set, false otherwise.
 */
export interface InSetExpression {
  /** The type of operation, always 'in_set'. */
  type: "in_set";
  /** The expression whose value will be checked for membership in the set. */
  value: Expression;
  /** The set of values to check membership against. */
  set: (string | number | boolean | null)[];
}

/**
 * Represents an alias operation.
 * This operation creates a new expression with a specified alias.
 */
export interface AliasExpression {
  /** The type of operation, always 'alias'. */
  type: "alias";
  /** The expression to alias. */
  value: Expression;
  /** The alias name. */
  name: string;
}
