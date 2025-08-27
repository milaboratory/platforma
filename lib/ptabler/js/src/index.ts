/**
 * PTabler JavaScript Expression System
 *
 * Provides JavaScript/TypeScript implementation of PTabler expression API
 * with identical JSON output to Tengo implementation.
 */

// Export core expression classes
export { Expression } from './expressions/base';
export { ColumnExpression } from './expressions/column';
export { LiteralExpression } from './expressions/literal';

// Export factory functions
export {
  allHorizontal, and, anyHorizontal, col,
  lit, or, rank, RankBuilder, RankExpression, when, WhenThenBuilder, WhenThenOtherwiseExpression,
} from './functions';

// Re-export all expression classes for advanced usage
export {
  ArithmeticExpression, coerceToExpression, ComparisonExpression,
  LogicalExpression, NullCheckExpression, UnaryArithmeticExpression,
} from './expressions/base';
