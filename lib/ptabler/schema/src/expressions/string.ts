import type { Expression } from "./base";

/** Represents a string join operation on an array of expressions. */
export interface StringJoinExpression {
  /** The type of operation, always 'str_join'. */
  type: "str_join";
  /** An array of expressions whose string representations will be joined. */
  operands: Expression[];
  /** An optional delimiter string to insert between joined elements. */
  delimiter?: string;
}

/** Defines the supported unary string operators. */
export type UnaryStringOperator = "to_upper" | "to_lower";

/** Represents a unary string operation on a single expression. */
export interface ExtendedUnaryStringExpression {
  /** The type of unary string operation (e.g., 'to_upper', 'to_lower', 'str_len'). */
  type: UnaryStringOperator | "str_len";
  /** The string expression to operate on. */
  value: Expression;
}

/**
 * Represents a substring extraction operation on an expression.
 * Extracts a portion of the string value resulting from the 'value' expression.
 * The substring starts at the 'start' index (0-based).
 * - If 'length' is provided, it specifies the maximum length of the substring.
 * - If 'end' is provided, it specifies the index *before* which the substring ends.
 * - If neither 'length' nor 'end' is provided, the substring extends to the end of the string.
 * - 'length' and 'end' are mutually exclusive.
 * If the requested substring range extends beyond the actual string length,
 * the extraction automatically stops at the end of the string.
 */
export interface SubstringExpression {
  /** The type of operation, always 'substring'. */
  type: "substring";
  /** The expression whose string value will be used. */
  value: Expression;
  /** The starting position (0-indexed). Should evaluate to a number. */
  start: Expression;
  /** The length of the substring. Mutually exclusive with 'end'. Should evaluate to a number. */
  length?: Expression;
  /** The end position of the substring (exclusive). Mutually exclusive with 'length'. Should evaluate to a number. */
  end?: Expression;
}

/**
 * Represents a string replacement operation.
 * Replaces occurrences of a pattern (regex or literal) in a string expression with a replacement string.
 * The behavior is aligned with Polars' `replace` and `replace_all` functions.
 *
 * - If `literal` is true, the `pattern` is treated as a literal string. Otherwise, it's treated as a regular expression.
 * - If `replaceAll` is true, all occurrences of the pattern are replaced. Otherwise, only the first occurrence is replaced.
 *
 * When using regular expressions (i.e., `literal` is false or undefined):
 * - Positional capture groups can be referenced in the `replacement` string using `$n` or `${n}` (e.g., `$1` for the first group).
 * - Named capture groups can be referenced using `${name}`.
 * - To include a literal dollar sign (`$`) in the replacement, it must be escaped as `$$`.
 */
export interface StringReplaceExpression {
  /** The type of operation, always 'str_replace'. */
  type: "str_replace";
  /** The input string expression to operate on. */
  value: Expression;
  /** The pattern (regex or literal string) to search for. Can be a string literal or an expression evaluating to a string. */
  pattern: Expression | string;
  /** The replacement string. Can be a string literal or an expression evaluating to a string. Can use $n or ${name} for captured groups if pattern is a regex. */
  replacement: Expression | string;
  /** If true, replace all occurrences of the pattern. If false or undefined, replace only the first. Defaults to false. */
  replaceAll?: boolean;
  /** If true, treat the pattern as a literal string. If false or undefined, treat it as a regex. Defaults to false. */
  literal?: boolean;
}

/**
 * Represents a string contains operation.
 * Checks if the string contains a substring that matches a pattern using regex or literal matching.
 * Based on polars.Series.str.contains - supports both regex and literal pattern matching with optional case-insensitive flags.
 */
export interface StringContainsExpression {
  /** The type of operation, always 'str_contains'. */
  type: "str_contains";
  /** The input string expression to search in. */
  value: Expression;
  /** The pattern to search for. Can be a regex pattern (default) or literal string when literal=true. */
  pattern: Expression | string;
  /** If true, treat the pattern as a literal string. If false, treat it as a regex pattern. Defaults to false. */
  literal?: boolean;
  /** If true, raise an error if pattern is invalid regex. If false, return null for invalid patterns. Defaults to true. */
  strict?: boolean;
}

/**
 * Represents a string starts_with operation.
 * Checks if the string starts with a specified prefix. Always uses literal matching (no regex support).
 * Based on polars.Series.str.starts_with - only supports literal prefix matching.
 */
export interface StringStartsWithExpression {
  /** The type of operation, always 'str_starts_with'. */
  type: "str_starts_with";
  /** The input string expression to check. */
  value: Expression;
  /** The prefix to check for (always treated as literal string, no regex support). */
  prefix: Expression | string;
}

/**
 * Represents a string ends_with operation.
 * Checks if the string ends with a specified suffix. Always uses literal matching (no regex support).
 * Based on polars.Series.str.ends_with - only supports literal suffix matching.
 */
export interface StringEndsWithExpression {
  /** The type of operation, always 'str_ends_with'. */
  type: "str_ends_with";
  /** The input string expression to check. */
  value: Expression;
  /** The suffix to check for (always treated as literal string, no regex support). */
  suffix: Expression | string;
}

/**
 * Represents a string contains_any operation using the Aho-Corasick algorithm.
 * Checks if the string contains any of the provided patterns using fast multi-pattern string matching.
 * Based on polars.Series.str.contains_any - uses Aho-Corasick algorithm for efficient multi-pattern matching.
 */
export interface StringContainsAnyExpression {
  /** The type of operation, always 'str_contains_any'. */
  type: "str_contains_any";
  /** The input string expression to search in. */
  value: Expression;
  /** Array of literal string patterns to search for. Only immediate string values are supported, no expressions or regex patterns. */
  patterns: string[];
  /** Enable ASCII-aware case insensitive matching. When enabled, searching is performed without respect to case for ASCII letters (a-z and A-Z) only. Defaults to false. */
  asciiCaseInsensitive?: boolean;
}

/**
 * Represents a string count_matches operation.
 * Counts the number of times a pattern occurs in the string using regex or literal matching.
 * Based on polars.Series.str.count_matches - supports both regex and literal pattern matching.
 */
export interface StringCountMatchesExpression {
  /** The type of operation, always 'str_count_matches'. */
  type: "str_count_matches";
  /** The input string expression to count matches in. */
  value: Expression;
  /** The pattern to count occurrences of. Can be a regex pattern (default) or literal string when literal=true. */
  pattern: Expression | string;
  /** If true, treat the pattern as a literal string. If false, treat it as a regex pattern. Defaults to false. */
  literal?: boolean;
}

/**
 * Represents a string extract operation using regex patterns.
 * Extracts the first match of a regex pattern from the string, optionally targeting specific capture groups.
 * Based on polars.Series.str.extract - only supports regex patterns (no literal mode).
 */
export interface StringExtractExpression {
  /** The type of operation, always 'str_extract'. */
  type: "str_extract";
  /** The input string expression to extract from. */
  value: Expression;
  /** The regex pattern to extract. Must be a valid regex pattern - no literal string mode is supported. */
  pattern: Expression | string;
  /** The capture group index to extract. Group 0 is the entire match, group 1 is the first capture group, etc. Defaults to 0. */
  groupIndex?: number;
}
