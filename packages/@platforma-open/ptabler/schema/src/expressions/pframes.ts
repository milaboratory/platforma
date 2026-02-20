import type { Expression } from "./base";

/**
 * Represents a regex matching operation using ECMAScript regular expressions.
 * Takes a string expression as input and returns a boolean indicating if the input value
 * matches the provided ECMAScript regular expression.
 */
export interface MatchesEcmaRegexExpression {
  /** The type of operation, always 'matches_ecma_regex'. */
  type: "matches_ecma_regex";
  /** The string expression whose value will be compared. */
  value: Expression;
  /** The ECMAScript regular expression to match against. */
  ecma_regex: string;
}

/**
 * Represents a fuzzy string matching operation.
 * Takes a string expression as input and returns a boolean indicating if the input value
 * contains a close match to the provided reference string.
 */
export interface ContainsFuzzyMatchExpression {
  /** The type of operation, always 'contains_fuzzy_match'. */
  type: "contains_fuzzy_match";
  /** The string expression whose value will be compared. */
  value: Expression;
  /** The string reference to compare against. */
  reference: string;
  /** The maximum number of edits allowed to be considered a match. */
  max_edits: number;
  /** The wildcard character to use. */
  wildcard?: string;
  /** If true, only substitutions are allowed (deletions and insertions are also allowed by default). */
  substitutions_only?: boolean;
}

/**
 * Represents a regex replacement operation using ECMAScript regular expressions.
 * Performs JavaScript String.prototype.replace() operation.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace
 *
 * @example
 * Input: "result.POIS_P001_W104_PBMC_2.clns"
 * Pattern: "^.*(P\\d+)_(W\\d+).*$"
 * Replacement: "$2-$1"
 * Result: "W104-P001"
 */
export interface ReplaceEcmaRegexExpression {
  /** The type of operation, always 'replace_ecma_regex'. */
  type: "replace_ecma_regex";
  /** The string expression whose value will be replaced. */
  value: Expression;
  /**
   * String representing ECMAScript RegEx with at least one capturing group.
   * If you need to reorder capturing groups - use RegExp matching the whole string
   * (must start with string begin anchor ^, end with string end anchor $).
   * Use regex playground https://regexr.com/ to test your ideas.
   */
  ecma_regex: string;
  /**
   * Replacement pattern used to construct result string from captured groups.
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement
   * Empty string as result would become NA.
   */
  replacement: string;
}

/**
 * Represents a regex extraction operation using ECMAScript regular expressions.
 * Simplified 'regexpReplace' with replacement set to $1.
 * This means that string is replaced with first capture group value.
 *
 * RegEx must match the entire string, this would be enforced even when ^ and $ are skipped.
 * If there are no matches - value would be replaced with empty string.
 *
 * @example
 * // Example 1:
 * Input: "123___abc.xlsx"
 * Pattern: "\\d+___([a-z]+).xlsx"
 * Result: "abc"
 *
 * @example
 * // Example 2:
 * Input: "123___abc.xlsx"
 * Pattern: "(\\d+)___([a-z]+).xlsx"
 * Result: "123"
 *
 * @example
 * // Example 3:
 * Input: "123___abc.xlsx"
 * Pattern: "((\\d+)___([a-z]+)).xlsx"
 * Result: "123___abc"
 *
 * @example
 * // Wrong example (pattern doesn't match entire string):
 * Input: "123___abc.xlsx"
 * Pattern: "(\\d+___[a-z]+)"
 * Result: "" (empty string, as .xlsx part is missing in pattern, so pattern was not matched)
 *
 * @example
 * // Correct example:
 * Input: "123___abc.xlsx"
 * Pattern: "(\\d+___[a-z]+).xlsx"
 * Result: "123___abc"
 */
export interface ExtractEcmaRegexExpression {
  /** The type of operation, always 'extract_ecma_regex'. */
  type: "extract_ecma_regex";
  /** The string expression whose value will be extracted. */
  value: Expression;
  /**
   * String representing ECMAScript RegEx with at least one capturing group.
   * RegEx must match the entire string, this would be enforced even when ^ and $ are skipped.
   * If there are no matches - value would be replaced with empty string.
   */
  ecma_regex: string;
}
