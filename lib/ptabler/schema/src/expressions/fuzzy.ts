import type { Expression } from './base';

/** Defines the supported string distance metrics. */
export type StringDistanceMetric =
  | 'levenshtein'
  | 'optimal_string_alignment'
  | 'jaro_winkler';

/**
 * Represents a string distance/similarity calculation between two expressions.
 * Computes metrics like Levenshtein, Optimal String Alignment, or Jaro-Winkler.
 */
export interface StringDistanceExpression {
  /** The type of operation, always 'string_distance'. */
  type: 'string_distance';
  /** The specific distance metric to use. */
  metric: StringDistanceMetric;
  /** The first string expression. */
  string1: Expression;
  /** The second string expression to compare against. */
  string2: Expression;
  /**
   * If true, the expression returns a similarity score (typically normalized between 0 and 1).
   * If false or undefined, it returns the raw edit distance (e.g., Levenshtein, OSA).
   * Jaro-Winkler inherently returns a similarity score; this flag might be ignored or influence its normalization if applicable.
   */
  returnSimilarity?: boolean;
}

/** Defines the supported fuzzy string filter distance metrics. */
export type FuzzyFilterDistanceMetric = 'levenshtein' | 'hamming';

/**
 * Represents a fuzzy string filter operation on an expression.
 * This operation compares the string value of an expression (`value`)
 * against another string or string expression (`pattern`) using a specified
 * distance metric (`levenshtein` or `hamming`), returning true if the distance is
 * within the specified `bound`.
 */
export interface FuzzyStringFilterExpression {
  /** The type of operation, always 'fuzzy_string_filter'. */
  type: 'fuzzy_string_filter';
  /** The distance metric to use for the fuzzy comparison. */
  metric: FuzzyFilterDistanceMetric;
  /** The expression whose string value will be compared. */
  value: Expression;
  /** The expression representing the string pattern to compare against. */
  pattern: Expression;
  /** The maximum allowed distance for a match (inclusive). */
  bound: number;
}
