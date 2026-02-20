import type { AxisSpec } from "@milaboratories/pl-model-common";

/**
 * Represents a selector for all columns.
 * Selects all columns in the DataFrame.
 */
export interface AllSelectorExpression {
  /** The type of operation, always 'all'. */
  type: "selector_all";
}

/**
 * Represents a selector for string columns.
 * Selects all columns with string data types.
 */
export interface StringSelectorExpression {
  /** The type of operation, always 'string'. */
  type: "selector_string";
}

/**
 * Represents a selector for numeric columns.
 * Selects all columns with numeric data types (integers and floats).
 */
export interface NumericSelectorExpression {
  /** The type of operation, always 'numeric'. */
  type: "selector_numeric";
}

/**
 * Represents a selector for integer columns.
 * Selects all columns with integer data types.
 */
export interface IntegerSelectorExpression {
  /** The type of operation, always 'integer'. */
  type: "selector_integer";
}

/**
 * Represents a selector for float columns.
 * Selects all columns with floating-point data types.
 */
export interface FloatSelectorExpression {
  /** The type of operation, always 'float'. */
  type: "selector_float";
}

/**
 * Represents a selector for columns that start with a specific prefix.
 * Selects columns whose names start with the specified prefix string.
 */
export interface StartsWithSelectorExpression {
  /** The type of operation, always 'starts_with'. */
  type: "selector_starts_with";
  /** The prefix to match column names against. */
  prefix: string;
}

/**
 * Represents a selector for columns that end with a specific suffix.
 * Selects columns whose names end with the specified suffix string.
 */
export interface EndsWithSelectorExpression {
  /** The type of operation, always 'ends_with'. */
  type: "selector_ends_with";
  /** The suffix to match column names against. */
  suffix: string;
}

/**
 * Represents a selector for columns that contain a specific substring.
 * Selects columns whose names contain the specified substring.
 */
export interface ContainsSelectorExpression {
  /** The type of operation, always 'contains'. */
  type: "selector_contains";
  /** The substring to match within column names. */
  substring: string;
}

/**
 * Represents a selector for columns that match a regex pattern.
 * Selects columns whose names match the specified regular expression pattern.
 */
export interface MatchesSelectorExpression {
  /** The type of operation, always 'matches'. */
  type: "selector_matches";
  /** The regex pattern to match column names against. */
  pattern: string;
}

/**
 * Represents a selector that excludes specific columns by name.
 * Selects all columns except those explicitly listed.
 */
export interface ExcludeSelectorExpression {
  /** The type of operation, always 'exclude'. */
  type: "selector_exclude";
  /** The list of column names to exclude from selection. */
  columns: string[];
}

/**
 * Represents a selector for columns by their exact names.
 * Selects columns that match any of the specified names.
 */
export interface ByNameSelectorExpression {
  /** The type of operation, always 'by_name'. */
  type: "selector_by_name";
  /** The list of column names to select. */
  names: string[];
}

/**
 * Represents a selector for axis.
 * Selects axis with the given spec if it exists in the result.
 */
export interface AxisSelectorExpression {
  /** The type of operation, always 'axis'. */
  type: "selector_axis";
  /** The axis to select. */
  axis: AxisSpec;
}

/**
 * Represents a selector for nested columns.
 * Selects columns that have nested/complex data types (e.g., structs, lists).
 */
export interface NestedSelectorExpression {
  /** The type of operation, always 'nested'. */
  type: "selector_nested";
}

/** Defines all available selector expression types. */
export type SelectorExpression =
  | AllSelectorExpression
  | StringSelectorExpression
  | NumericSelectorExpression
  | IntegerSelectorExpression
  | FloatSelectorExpression
  | StartsWithSelectorExpression
  | EndsWithSelectorExpression
  | ContainsSelectorExpression
  | MatchesSelectorExpression
  | ExcludeSelectorExpression
  | ByNameSelectorExpression
  | AxisSelectorExpression
  | NestedSelectorExpression;

/**
 * Represents the complement of a selector.
 * Selects all columns that are NOT selected by the inner selector.
 */
export interface SelectorComplementExpression {
  /** The type of operation, always 'selector_complement'. */
  type: "selector_complement";
  /** The selector to complement. */
  selector: SelectorExpression;
}

/**
 * Represents the union of multiple selectors.
 * Selects columns that match ANY of the provided selectors (logical OR).
 */
export interface SelectorUnionExpression {
  /** The type of operation, always 'selector_union'. */
  type: "selector_union";
  /** The list of selectors to union. */
  selectors: SelectorExpression[];
}

/**
 * Represents the intersection of multiple selectors.
 * Selects columns that match ALL of the provided selectors (logical AND).
 */
export interface SelectorIntersectionExpression {
  /** The type of operation, always 'selector_intersection'. */
  type: "selector_intersection";
  /** The list of selectors to intersect. */
  selectors: SelectorExpression[];
}

/**
 * Represents the difference of multiple selectors.
 * Selects columns from the first selector minus those selected by subsequent selectors.
 */
export interface SelectorDifferenceExpression {
  /** The type of operation, always 'selector_difference'. */
  type: "selector_difference";
  /** The list of selectors to apply difference operation. */
  selectors: SelectorExpression[];
}

/**
 * Represents the symmetric difference of multiple selectors.
 * Selects columns that are in an odd number of the provided selectors (logical XOR).
 */
export interface SelectorSymmetricDifferenceExpression {
  /** The type of operation, always 'selector_symmetric_difference'. */
  type: "selector_symmetric_difference";
  /** The list of selectors to apply symmetric difference operation. */
  selectors: SelectorExpression[];
}
