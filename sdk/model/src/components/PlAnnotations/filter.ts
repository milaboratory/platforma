import type { SUniversalPColumnId } from '@platforma-sdk/model';

//
// Sequence filter
//

/**
 * Represents an equals predicate for pattern filtering.
 * Checks if the pattern exactly matches the provided value.
 * Can handle both string literals and biological sequences with wildcards.
 */
export type PatternPredicateEquals = {
  type: 'equals';
  /** The exact pattern value to match */
  value: string;
};

/**
 * Represents a subsequence containment predicate for pattern filtering.
 * Checks if the pattern contains the provided subsequence.
 * Can handle both string literals and biological sequences with wildcards.
 */
export type PatternPredicateContainSubsequence = {
  type: 'containSubsequence';
  /** The subpattern to search for within the target pattern */
  value: string;
};

/**
 * Union type for pattern predicates that can be applied to both sequence and string data.
 */
export type PatternPredicate = PatternPredicateEquals | PatternPredicateContainSubsequence;

/**
 * Filter for pattern data, specifying the column to filter and the predicate to apply.
 * Works with both biological sequences (with wildcards) and regular strings.
 */
export type PatternFilter = {
  type: 'pattern';
  /** The column identifier to apply the filter to */
  column: SUniversalPColumnId;
  /** The predicate defining the filtering logic */
  predicate: PatternPredicate;
};

//
// Numerical filter
//

/**
 * Transforms a column's values into their rank positions.
 *
 * Ranks start from 1 and represent the position of each value after sorting.
 * When descending=true, higher values receive lower ranks (rank 1 is highest value).
 * When descending=false (default), lower values receive lower ranks (rank 1 is lowest value).
 *
 * For multi-sample columns, ranking is performed independently within each sample.
 *
 * The ranked values can be used in numerical comparison filters.
 */
export type ValueRank = {
  transformer: 'rank';
  /** The column identifier to apply the ranking to */
  column: SUniversalPColumnId;
  /** If true, sorts highest values first (highest value gets rank 1) */
  descending?: true;
};

/**
 * Transforms a column's values into a running total after sorting.
 *
 * First sorts all values, then calculates the cumulative sum at each position.
 * Enables filters like "select clonotypes that make up the top 10% of total abundance".
 *
 * For multi-sample columns, cumulative sums are calculated independently within each sample.
 *
 * The cumulative values can be used in numerical comparison filters.
 */
export type SortedCumulativeSum = {
  transformer: 'sortedCumulativeSum';
  /** The column identifier to apply the cumulative sum to */
  column: SUniversalPColumnId;
  /** If true, sorts values in descending order before calculating the cumulative sum */
  descending?: true;
};

/**
 * Transforms a column's values by applying the log10 function.
 *
 * Calculates the base-10 logarithm for each value in the specified column.
 * This is useful for filtering based on log-fold changes.
 *
 * The log10-transformed values can be used in numerical comparison filters.
 * Note: The behavior for non-positive input values (<= 0) results in -Infinity.
 */
export type Log10 = {
  transformer: 'log10';
  /** The column identifier to apply the log10 transformation to */
  column: SUniversalPColumnId;
};

/**
 * Represents a column whose values have been transformed by either ranking or
 * cumulative summation. These transformations allow for more complex filtering
 * operations such as "top N" or "first X%" queries.
 * Any NA values are propagated to the transformed column, and ignored in ranks and cumulative sums.
 */
export type TransformedColumn = ValueRank | SortedCumulativeSum | Log10;

/**
 * Defines a numerical comparison between two values that can be column references or constants.
 *
 * If lhs or rhs is NA, the filter will always return false.
 *
 * The basic formula is: lhs + minDiff < rhs (or <= if allowEqual is true)
 *
 * Examples:
 * - Compare two columns: columnA < columnB
 * - Compare with threshold: abundance > 0.05
 * - Compare with minimum difference: columnA + 10 < columnB
 *
 * Rules:
 * - At least one side must reference a column or a transformed column (both sides cannot be constants)
 * - The minDiff parameter can only be used when both sides are columns or transformed columns
 * - Use allowEqual=true to include equality in the comparison (<=)
 */
export type NumericalComparisonFilter = {
  type: 'numericalComparison';
  /** The first column to compare (left side of comparison) */
  lhs: SUniversalPColumnId | TransformedColumn | number;
  /** The second column to compare (right side of comparison) */
  rhs: SUniversalPColumnId | TransformedColumn | number;
  /** The minimum difference between lhs and rhs values */
  minDiff?: number;
  /** Whether equality is permitted in the comparison */
  allowEqual?: true;
};

/**
 * Represents a filter that checks if a column's values are NA (not available).
 * This filter is useful for filtering out records where a specific column has no value / clonotype is not present.
 */
export type IsNA = {
  type: 'isNA';
  /** The column identifier to check for NA values */
  column: SUniversalPColumnId;
};

//
// Logical filters
//

/**
 * Represents a logical OR operation between multiple filters.
 * A record matches if at least one of the contained filters matches.
 */
export interface OrFilter {
  type: 'or';
  /** Array of filters to combine with OR logic */
  filters: AnnotationFilter[];
}

/**
 * Represents a logical AND operation between multiple filters.
 * A record matches only if all of the contained filters match.
 */
export interface AndFilter {
  type: 'and';
  /** Array of filters to combine with AND logic */
  filters: AnnotationFilter[];
}

/**
 * Represents a logical NOT operation on a filter.
 * A record matches if it does not match the contained filter.
 */
export interface NotFilter {
  type: 'not';
  /** The filter to negate */
  filter: AnnotationFilter;
}

/**
 * Union type for all supported annotation filters.
 */
export type AnnotationFilter = IsNA | PatternFilter | NumericalComparisonFilter | OrFilter | AndFilter | NotFilter;

//
// Annotation
//

/**
 * Represents a single step in the annotation process.
 * Each step consists of a filter to select records and a label to assign to those records.
 */
export type AnnotationStep = {
  /** The filter to apply for selecting records */
  filter: AnnotationFilter;
  /** The label to assign to records that match the filter */
  label: string;
};

/**
 * Specifies which entity to annotate: either entire clonotypes or clonotypes within specific samples.
 * This choice affects how filtering and labeling will be applied across your dataset.
 */
export type AnnotationMode =
  /**
   * Annotates entire clonotypes globally, regardless of which samples they appear in.
   * A clonotype will either be fully included or excluded across all samples.
   * The resulting column will have the following shape:
   *   [clonotype_key] -> label
   */
  | 'byClonotype'
  /**
   * Annotates clonotypes independently within each sample.
   * This allows sample-specific filtering, where a clonotype might be included in one sample
   * but excluded in another (e.g., labe low-abundance occurrences that might be contamination
   * while keeping the same clonotype where it has significant abundance).
   * Usage of multi-sample columns (like abundances not constrained by specific sample) is only supported in this mode.
   * The resulting column will have the following shape:
   *   [sample_id, clonotype_key] -> label
   */
  | 'bySampleAndClonotype';

/**
 * Represents a complete annotation configuration.
 * Contains a series of annotation steps that are applied in sequence.
 * Annotations are applied from lower indices to higher indices (earlier steps are processed first),
 * with later steps taking precedence when multiple steps match the same record.
 */
export type AnnotationScript = {
  /** The title of the annotation */
  title: string;
  /** The mode of annotation to apply */
  mode: AnnotationMode;
  /** Ordered list of annotation steps to apply */
  steps: AnnotationStep[];
};

export type AnnotationScript2<S extends AnnotationStep> = {
  /** The mode of annotation to apply */
  mode: AnnotationMode;
  /** Ordered list of annotation steps to apply */
  steps: S[];
};
