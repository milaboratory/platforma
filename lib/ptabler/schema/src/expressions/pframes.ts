import type { Expression } from './base';

/**
 * Represents a regex matching operation using ECMAScript regular expressions.
 * Takes a string expression as input and returns a boolean indicating if the input value
 * matches the provided ECMAScript regular expression.
 */
export interface MatchesEcmaRegexExpression {
  /** The type of operation, always 'matches_ecma_regex'. */
  type: 'matches_ecma_regex';
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
  type: 'contains_fuzzy_match';
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
