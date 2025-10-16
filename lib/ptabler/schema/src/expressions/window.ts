import type { Expression } from './base';

/**
 * Represents a rank function applied over a dataset partition.
 * Calculates the rank of each row within its partition based on the specified ordering.
 */
export interface RankExpression {
  /** The type of operation, always 'rank'. */
  type: 'rank';
  /** List of expressions to partition the data by before ranking. The output of these expressions will be used for partitioning. */
  partitionBy: Expression[];
  /** Defines the ordering expressions within partitions to determine the rank. */
  orderBy: Expression[];
  /** Whether to sort in descending order. Defaults to false (ascending). */
  descending?: boolean;
}

/**
 * Represents a cumulative sum function applied over a dataset partition.
 * Calculates the cumulative sum of the 'value' expression within each partition,
 * based on the specified ordering. Values are sorted by value and then by
 * additional_order_by before summing.
 */
export interface CumsumExpression {
  /** The type of operation, always 'cumsum'. */
  type: 'cumsum';
  /** The expression whose values will be cumulatively summed. */
  value: Expression;
  /** Defines additional ordering within partitions for the cumulative sum calculation, in addition to the ordering of the values themselves. */
  additionalOrderBy: Expression[];
  /** List of expressions to partition the data by before calculating the cumulative sum. The output of these expressions will be used for partitioning. */
  partitionBy: Expression[];
  /** Whether to sort in descending order. Defaults to false (ascending). */
  descending?: boolean;
}

/**
 * Defines standard aggregation functions that can be used in window expressions.
 */
export type AggregationType =
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
 * Represents a window function call.
 * This allows applying an aggregation function over a specific partition of the data.
 */
export interface WindowExpression {
  /** The type of operation, always 'aggregate'. Note: This might be confusing, consider 'window_aggregate' or similar if 'aggregate' is heavily used elsewhere for a different step type. */
  type: 'aggregate';
  /** The aggregation function to apply (e.g., 'sum', 'mean'). */
  aggregation: AggregationType;
  /** The expression to apply the aggregation function to. */
  value: Expression;
  /** List of expressions to partition the data by. The aggregation is performed independently within each partition. */
  partitionBy: Expression[];
}
