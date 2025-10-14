from typing import Union
import polars.selectors as cs
import polars as pl

from .base import Expression

type AnyExpression = Expression

class AllSelectorExpression(Expression, tag='selector_all'):
    def to_polars(self) -> pl.Expr:
        return cs.all()


class StringSelectorExpression(Expression, tag='selector_string'):
    def to_polars(self) -> pl.Expr:
        return cs.string()


class NumericSelectorExpression(Expression, tag='selector_numeric'):
    def to_polars(self) -> pl.Expr:
        return cs.numeric()


class IntegerSelectorExpression(Expression, tag='selector_integer'):
    def to_polars(self) -> pl.Expr:
        return cs.integer()


class FloatSelectorExpression(Expression, tag='selector_float'):
    def to_polars(self) -> pl.Expr:
        return cs.float()


class StartsWithSelectorExpression(Expression, tag='selector_starts_with'):
    prefix: str
    def to_polars(self) -> pl.Expr:
        return cs.starts_with(self.prefix)


class EndsWithSelectorExpression(Expression, tag='selector_ends_with'):
    suffix: str
    def to_polars(self) -> pl.Expr:
        return cs.ends_with(self.suffix)


class ContainsSelectorExpression(Expression, tag='selector_contains'):
    substring: str
    def to_polars(self) -> pl.Expr:
        return cs.contains(self.substring)


class MatchesSelectorExpression(Expression, tag='selector_matches'):
    pattern: str
    def to_polars(self) -> pl.Expr:
        return cs.matches(self.pattern)


class ExcludeSelectorExpression(Expression, tag='selector_exclude'):
    columns: list[str]
    def to_polars(self) -> pl.Expr:
        return cs.exclude(*self.columns)


class ByNameSelectorExpression(Expression, tag='selector_by_name'):
    names: list[str]
    def to_polars(self) -> pl.Expr:
        return cs.by_name(*self.names)


class NestedSelectorExpression(Expression, tag='selector_nested'):
    def to_polars(self) -> pl.Expr:
        return cs.nested()


type AnySelectorExpression = Union[
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
    NestedSelectorExpression,
]


class SelectorComplementExpression(Expression, tag='selector_complement'):
    selector: AnySelectorExpression

    def to_polars(self) -> pl.Expr:
        return ~self.selector.to_polars()


class SelectorUnionExpression(Expression, tag='selector_union'):
    selectors: list[AnySelectorExpression]

    def to_polars(self) -> pl.Expr:
        union = self.selectors[0].to_polars()
        for selector in self.selectors[1:]:
            union = union | selector.to_polars()
        return union


class SelectorIntersectionExpression(Expression, tag='selector_intersection'):
    selectors: list[AnySelectorExpression]

    def to_polars(self) -> pl.Expr:
        intersection = self.selectors[0].to_polars()
        for selector in self.selectors[1:]:
            intersection = intersection & selector.to_polars()
        return intersection


class SelectorDifferenceExpression(Expression, tag='selector_difference'):
    selectors: list[AnySelectorExpression]

    def to_polars(self) -> pl.Expr:
        difference = self.selectors[0].to_polars()
        for selector in self.selectors[1:]:
            difference = difference - selector.to_polars()
        return difference


class SelectorSymmetricDifferenceExpression(Expression, tag='selector_symmetric_difference'):
    selectors: list[AnySelectorExpression]

    def to_polars(self) -> pl.Expr:
        symmetric_difference = self.selectors[0].to_polars()
        for selector in self.selectors[1:]:
            symmetric_difference = symmetric_difference ^ selector.to_polars()
        return symmetric_difference
