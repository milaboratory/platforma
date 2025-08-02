import typing
import polars as pl
import polars_ds as pds

from .base import Expression

StringDistanceMetric = typing.Literal[
    "levenshtein",
    "optimal_string_alignment",
    "jaro_winkler"
]

AnyExpression = Expression


class StringDistanceExpression(Expression, tag='string_distance'):
    """
    Computes string distance or similarity between two string expressions.
    Corresponds to StringDistanceExpression in TypeScript.
    Leverages functions from the polars-ds library.
    """
    metric: StringDistanceMetric
    """The specific distance metric to use (e.g., 'levenshtein')."""
    string1: 'AnyExpression'
    """The first string expression."""
    string2: 'AnyExpression'
    """The second string expression to compare against."""
    return_similarity: typing.Optional[bool] = False
    """
    If true, return similarity (0-1). If false (default), return distance.
    Jaro-Winkler always returns similarity.
    """

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars expression using polars-ds."""
        s1_polars = self.string1.to_polars()
        s2_polars = self.string2.to_polars()

        match self.metric:
            case "levenshtein":
                return pds.str_leven(
                    s1_polars, s2_polars, return_sim=self.return_similarity or False
                )
            case "optimal_string_alignment":
                return pds.str_osa(
                    s1_polars, s2_polars, return_sim=self.return_similarity or False
                )
            case "jaro_winkler":
                return pds.str_jw(
                    s1_polars, s2_polars
                )
            case _:
                # Should be unreachable due to Literal typing
                raise ValueError(
                    f"Unsupported string distance metric: {self.metric}")


FuzzyFilterDistanceMetric = typing.Literal['levenshtein', 'hamming']


class FuzzyStringFilterExpression(Expression, tag='fuzzy_string_filter'):
    """
    Filters strings based on their distance to a pattern string.
    Returns true if the distance is within the specified bound.
    Corresponds to FuzzyStringFilterExpression in TypeScript.
    Leverages functions from the polars-ds library.
    """
    metric: FuzzyFilterDistanceMetric
    """The distance metric to use ('levenshtein' or 'hamming')."""
    value: 'AnyExpression'
    """The string expression whose value will be compared."""
    pattern: 'AnyExpression'
    """The expression representing the string pattern to compare against."""
    bound: int
    """The maximum allowed distance for a match (inclusive). Must be non-negative."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars boolean expression using polars-ds."""
        if self.bound < 0:
            raise ValueError(
                f"FuzzyStringFilterExpression 'bound' ({self.bound}) cannot be negative.")

        value_polars = self.value.to_polars()
        pattern_polars = self.pattern.to_polars()

        match self.metric:
            case "levenshtein":
                return pds.filter_by_levenshtein(value_polars, pattern_polars, self.bound)
            case "hamming":
                return pds.filter_by_hamming(value_polars, pattern_polars, self.bound)
            case _:
                raise ValueError(
                    f"Unsupported fuzzy filter metric: {self.metric}")
