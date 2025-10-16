export * from './base';
export * from './basics';
export * from './selectors';
export * from './string';
export * from './fuzzy';
export * from './conditional';
export * from './window';
export * from './hash';
export * from './struct';
export * from './pframes';

import type {
  ComparisonExpression,
  BinaryArithmeticExpression,
  UnaryArithmeticExpression,
  CastExpression,
  BooleanLogicExpression,
  NotExpression,
  NullCheckExpression,
  ColumnReferenceExpression,
  AxisReferenceExpression,
  ConstantValueExpression,
  MinMaxExpression,
  InSetExpression,
  AliasExpression,
} from './basics';

import type {
  AllSelectorExpression,
  StringSelectorExpression,
  NumericSelectorExpression,
  IntegerSelectorExpression,
  FloatSelectorExpression,
  StartsWithSelectorExpression,
  EndsWithSelectorExpression,
  ContainsSelectorExpression,
  MatchesSelectorExpression,
  ExcludeSelectorExpression,
  ByNameSelectorExpression,
  AxisSelectorExpression,
  NestedSelectorExpression,
  SelectorComplementExpression,
  SelectorUnionExpression,
  SelectorIntersectionExpression,
  SelectorDifferenceExpression,
  SelectorSymmetricDifferenceExpression,
} from './selectors';

import type {
  StringJoinExpression,
  ExtendedUnaryStringExpression,
  SubstringExpression,
  StringReplaceExpression,
  StringContainsExpression,
  StringStartsWithExpression,
  StringEndsWithExpression,
  StringContainsAnyExpression,
  StringCountMatchesExpression,
  StringExtractExpression,
} from './string';

import type {
  StringDistanceExpression,
  FuzzyStringFilterExpression,
} from './fuzzy';

import type {
  WhenThenOtherwiseExpression,
  FillNullExpression,
  FillNaNExpression,
} from './conditional';

import type {
  RankExpression,
  CumsumExpression,
  WindowExpression,
} from './window';

import type { HashExpression } from './hash';
import type { StructFieldExpression } from './struct';
import type {
  MatchesEcmaRegexExpression,
  ContainsFuzzyMatchExpression,
} from './pframes';

/**
 * Represents all possible expression types in the system.
 * This is the main union type that includes all concrete expression implementations.
 */
export type Expression =
  | ComparisonExpression
  | BinaryArithmeticExpression
  | UnaryArithmeticExpression
  | CastExpression
  | BooleanLogicExpression
  | NotExpression
  | NullCheckExpression
  | StringJoinExpression
  | HashExpression
  | ColumnReferenceExpression
  | AxisReferenceExpression
  | ConstantValueExpression
  | RankExpression
  | CumsumExpression
  | ExtendedUnaryStringExpression
  | StringDistanceExpression
  | FuzzyStringFilterExpression
  | WhenThenOtherwiseExpression
  | SubstringExpression
  | StringReplaceExpression
  | StringContainsExpression
  | StringStartsWithExpression
  | StringEndsWithExpression
  | StringContainsAnyExpression
  | StringCountMatchesExpression
  | StringExtractExpression
  | MinMaxExpression
  | FillNullExpression
  | FillNaNExpression
  | WindowExpression
  | StructFieldExpression
  | MatchesEcmaRegexExpression
  | ContainsFuzzyMatchExpression
  | InSetExpression
  | AliasExpression
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
  | NestedSelectorExpression
  | SelectorComplementExpression
  | SelectorUnionExpression
  | SelectorIntersectionExpression
  | SelectorDifferenceExpression
  | SelectorSymmetricDifferenceExpression;
