/**
 * Core type definitions for PTabler JavaScript expression system
 */

export type * from '@platforma-open/milaboratories.software-ptabler.schema';

/**
 * Options for rank expression
 */
export interface RankOptions {
  /** Whether to rank in descending order (default: false) */
  descending?: boolean;
  /** Method for handling ties: 'average', 'min', 'max', 'dense', 'ordinal' */
  method?: 'average' | 'min' | 'max' | 'dense' | 'ordinal';
}

/**
 * Options for string distance operations
 */
export interface StringDistanceOptions {
  /** Distance metric to use */
  metric: 'levenshtein' | 'optimal_string_alignment' | 'jaro_winkler';
  /** Whether to return similarity instead of distance (default: false) */
  returnSimilarity?: boolean;
}

/**
 * Options for fuzzy string filtering
 */
export interface FuzzyFilterOptions {
  /** Distance metric to use */
  metric: 'levenshtein' | 'hamming';
  /** Maximum allowed distance for a match */
  bound: number;
}

/**
 * Options for window operations
 */
export interface WindowOptions {
  /** Column names to partition by */
  partitionBy?: string | string[];
  /** Column names to order by */
  orderBy?: string | string[];
  /** Whether to order in descending order */
  orderByDescending?: boolean;
}

/**
 * Options for substring operations
 */
export interface SubstringOptions {
  /** Starting position (0-based) */
  start: number;
  /** Length of substring (optional) */
  length?: number;
}

/**
 * Options for string replace operations
 */
export interface StringReplaceOptions {
  /** Pattern to replace */
  pattern: string;
  /** Replacement value */
  value: string;
  /** Whether to replace all occurrences (default: false) */
  global?: boolean;
  /** Whether pattern is a regex (default: false) */
  literal?: boolean;
}
