import polars as pl
import msgspec
from typing import Union, List

from .base import GlobalSettings, PStep, TableSpace
from ..expression import AnyExpression


class BaseAggregationOperation(msgspec.Struct, frozen=True, tag_field='aggregation', rename="camel"):
    """
    Base class for all aggregation operations.
    Defines the output column name and the tag field for msgspec.
    Subclasses must implement how to convert themselves to a Polars aggregation expression.
    The 'rename="camel"' ensures Python snake_case fields are mapped to camelCase in JSON
    where applicable (e.g. if a field was 'by_expression', it would map to 'byExpression').
    The 'tag_field="aggregation"' tells msgspec to use the 'aggregation' field in the
    JSON (e.g., "aggregation": "sum") to determine the type.
    """
    name: str
    expression: AnyExpression

    def to_polars(self) -> pl.Expr:
        return self.to_polars_agg(self.expression.to_polars())

    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        """
        Converts this aggregation operation configuration into a Polars aggregation expression.

        Args:
            subject_expr: The Polars expression that this aggregation operates on
                          (derived from the 'expression' field of concrete subclasses).

        Returns:
            A Polars expression representing the aggregation.
        """
        pass


class Sum(BaseAggregationOperation, tag="sum"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.sum()


class Mean(BaseAggregationOperation, tag="mean"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.mean()


class Median(BaseAggregationOperation, tag="median"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.median()


class Min(BaseAggregationOperation, tag="min"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.min()


class Max(BaseAggregationOperation, tag="max"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.max()


class Std(BaseAggregationOperation, tag="std"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.std()


class Var(BaseAggregationOperation, tag="var"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.var()


class Count(BaseAggregationOperation, tag="count"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.count()


class First(BaseAggregationOperation, tag="first"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.first()


class Last(BaseAggregationOperation, tag="last"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.last()


class NUnique(BaseAggregationOperation, tag="n_unique"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        return subject_expr.n_unique()


class ByClauseBaseAggregation(BaseAggregationOperation):
    """
    Base for aggregations that select a value from 'expression'
    based on the min/max of 'by_expression'(s).
    'rename="camel"' ensures 'by_expression' maps to 'byExpression' in JSON.
    """
    by: list[AnyExpression]

    def _get_by_polars_expr_list(self) -> list[pl.Expr]:
        if not self.by:
            raise ValueError(
                f"'by_expression' list resolved to empty, which is invalid.")
        # if len(self.by) == 1:
        #     return self.by[0].to_polars()
        # else:
        return [e.to_polars() for e in self.by]


class MinBy(ByClauseBaseAggregation, tag="min_by", frozen=True, rename="camel"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        by_polars_expr_list = self._get_by_polars_expr_list()
        return subject_expr.bottom_k_by(by_polars_expr_list, k=1).first()


class MaxBy(ByClauseBaseAggregation, tag="max_by", frozen=True, rename="camel"):
    def to_polars_agg(self, subject_expr: pl.Expr) -> pl.Expr:
        by_polars_expr_list = self._get_by_polars_expr_list()
        return subject_expr.top_k_by(by_polars_expr_list, k=1).first()


AnyAggregationOperation = Union[
    Sum, Mean, Median, Min, Max, Std, Var, Count, First, Last, NUnique,
    MinBy, MaxBy
]


class Aggregate(PStep, tag="aggregate"):
    """
    PStep to perform aggregation operations on a table.
    This step takes an input table, optionally groups it by specified columns,
    applies a series of aggregation functions, and outputs a new table with
    the aggregated results.
    """
    input_table: str
    output_table: str
    group_by: List[Union[str, AnyExpression]]
    aggregations: list[AnyAggregationOperation]

    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
        if self.input_table not in table_space:
            raise ValueError(
                f"Input table '{self.input_table}' not found in tablespace. "
                f"Available tables: {list(table_space.keys())}"
            )

        lf = table_space[self.input_table]
        polars_aggs_to_apply = [op_config.to_polars().alias(op_config.name)
                                for op_config in self.aggregations]

        aggregated_lf: pl.LazyFrame
        if len(self.group_by) > 0:
            polars_group_by_exprs: List[Union[str, pl.Expr]] = []
            for item in self.group_by:
                if isinstance(item, str):
                    polars_group_by_exprs.append(item)
                elif hasattr(item, 'to_polars') and callable(item.to_polars): # Check if item is an Expression
                    polars_group_by_exprs.append(item.to_polars())
                else:
                    raise TypeError(f"Invalid type in group_by list: {type(item)}. Expected str or Expression.")

            aggregated_lf = lf.group_by(
                polars_group_by_exprs, maintain_order=True).agg(polars_aggs_to_apply)
        else:
            aggregated_lf = lf.select(polars_aggs_to_apply)

        updated_table_space = table_space.copy()
        updated_table_space[self.output_table] = aggregated_lf

        return updated_table_space, []
