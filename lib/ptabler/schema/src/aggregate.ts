import type { Expression, AggregationType } from './expressions';

/**
 * Defines standard aggregation functions that operate on a single expression.
 */
export type StandardAggregationType =
  | 'sum'
  | 'mean'
  | 'median'
  | 'min'
  | 'max'
  | 'std'
  | 'var'
  | 'count'
  | 'first'
  | 'last'
  | 'n_unique';

/**
 * Defines aggregation functions that select a value from one expression based on the min/max of another expression.
 */
export type ByClauseAggregationType =
  | 'max_by'
  | 'min_by';

/**
 * Represents a standard aggregation operation like sum, mean, count, etc.
 */
export interface StandardAggregationOperation {
  /** The name for the resulting column after aggregation. */
  name: string;
  /** The type of standard aggregation to perform. */
  aggregation: AggregationType;
  /**
   * The primary expression to aggregate.
   * For aggregations like 'sum', 'mean', 'min', 'max', this is the expression (e.g., a column) whose values are aggregated.
   * For 'count', this expression might not be directly used by Polars if counting all rows, but can be used to count non-null values in a specific column.
   * For 'first', 'last', 'n_unique', this is the expression on which the operation is performed.
   */
  expression: Expression;
}

/**
 * Represents an aggregation operation that selects a value from one expression
 * based on the minimum or maximum value of another expression (the 'by_expression').
 */
export interface ByClauseAggregationOperation {
  /** The name for the resulting column after aggregation. */
  name: string;
  /** The type of 'by-clause' aggregation to perform (e.g., 'max_by', 'min_by'). */
  aggregation: ByClauseAggregationType;
  /** The expression whose value is selected. */
  expression: Expression;
  /**
   * The expression or list of expressions to order by to determine which value of `expression` is selected.
   * If an array of expressions is provided, ordering is done sequentially by each expression.
   */
  by: Expression[];
}

/**
 * Represents the configuration for an 'aggregate' step in the workflow.
 * This step performs aggregation operations on a table, optionally grouping by certain columns,
 * and outputs a new table with the aggregated results.
 */
export interface AggregateStep {
  /** Specifies the type of the step, which is 'aggregate'. */
  type: 'aggregate';
  /** The name of the input table from the tablespace on which to perform aggregation. */
  inputTable: string;
  /** The name to be assigned to the newly created aggregated table in the tablespace. */
  outputTable: string;
  /** An optional list of column names or expressions to group by before performing aggregations. */
  groupBy: (string | Expression)[];
  /** An array of aggregation operations to apply to the input table. */
  aggregations: (StandardAggregationOperation | ByClauseAggregationOperation)[];
}
