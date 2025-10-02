from typing import cast, Optional

import polars as pl
import polars_pf as ppf

from .base import Expression

AnyExpression = Expression


class MatchesEcmaRegexExpression(Expression, tag='matches_ecma_regex'):
    """
    Takes Utf8 as input and returns Boolean indicating if the input value
    matches the provided ECMAScript regular expression.
    """
    value: 'AnyExpression'
    """The string expression whose value will be compared."""
    ecma_regex: str
    """The ECMAScript regular expression to match against."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars boolean expression using polars-pf."""
        return cast(ppf.Expr, self.value.to_polars()).pfexpr.matches_ecma_regex(self.ecma_regex)


class ContainsFuzzyMatchExpression(Expression, tag='contains_fuzzy_match'):
    """
    Takes Utf8 as input and returns Boolean indicating if the input value
    contains close match to provided reference.
    """
    value: 'AnyExpression'
    """The string expression whose value will be compared."""
    reference: str
    """The string reference to compare against."""
    max_edits: int
    """The maximum number of edits allowed to be considered a match."""
    wildcard: Optional[str] = None
    """The wildcard character to use."""
    substitutions_only: Optional[bool] = None
    """If true, only substitutions are allowed (deletions and insertions are also allowed by default)."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars boolean expression using polars-pf."""
        return cast(ppf.Expr, self.value.to_polars()).pfexpr.contains_fuzzy_match(
            self.reference,
            self.max_edits,
            wildcard=self.wildcard,
            substitutions_only=self.substitutions_only,
        )
