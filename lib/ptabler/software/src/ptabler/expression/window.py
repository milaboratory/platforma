import typing
import polars as pl

from .base import Expression

AnyExpression = Expression

AggregationType = typing.Literal[
    'sum',
    'mean',
    'median',
    'min',
    'max',
    'std',
    'var',
    'count',
    'first',
    'last',
    'n_unique'
]


class RankExpression(Expression, tag='rank'):
    """
    Represents a rank function applied over a dataset partition.
    Calculates the rank of each row within its partition based on the specified ordering.
    Corresponds to the RankExpression in TypeScript definitions.
    Uses Polars' dense rank method by default.
    """
    order_by: list['AnyExpression']
    partition_by: list['AnyExpression']
    descending: bool = False

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars rank window expression."""
        polars_partitions = [p.to_polars() for p in self.partition_by]
        polars_order_exprs = [ob.to_polars() for ob in self.order_by]

        if not polars_order_exprs:
            raise ValueError(
                "RankExpression requires at least one 'order_by' expression.")

        rank_expr = pl.struct(polars_order_exprs).rank(
            "ordinal", descending=self.descending)

        if polars_partitions:
            return rank_expr.over(polars_partitions)
        else:
            return rank_expr


class CumsumExpression(Expression, tag='cumsum'):
    """
    Represents a cumulative sum function applied over a dataset partition, respecting order.
    Calculates the cumulative sum of the 'value' expression within each partition,
    based on the specified ordering (value first, then additional_order_by).
    Corresponds to the CumsumExpression in TypeScript definitions.
    """
    value: 'AnyExpression'
    additional_order_by: list['AnyExpression']
    partition_by: list['AnyExpression']
    descending: bool = False

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars cumsum window expression."""
        polars_value = self.value.to_polars()
        polars_partitions = [p.to_polars() for p in self.partition_by]
        polars_additional_order = [ob.to_polars()
                                   for ob in self.additional_order_by]

        combined_order_exprs = [polars_value] + polars_additional_order

        descending_flags = [self.descending] * len(combined_order_exprs)

        sorted_value_expr = polars_value.sort_by(
            combined_order_exprs, descending=descending_flags,
            maintain_order=True)

        cumsum_after_sort_expr = sorted_value_expr.cum_sum()

        if polars_partitions:
            return cumsum_after_sort_expr.over(polars_partitions)
        else:
            return cumsum_after_sort_expr


class WindowExpression(Expression, tag='aggregate'):
    """
    Represents a generic window function call (e.g., sum, mean over a partition).
    Corresponds to the WindowExpression in TypeScript definitions.
    """
    aggregation: AggregationType
    value: 'AnyExpression'
    partition_by: list['AnyExpression']

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars window expression."""
        polars_value = self.value.to_polars()
        polars_partitions = [p.to_polars() for p in self.partition_by]

        agg_expr: pl.Expr
        match self.aggregation:
            case 'sum':
                agg_expr = polars_value.sum()
            case 'mean':
                agg_expr = polars_value.mean()
            case 'median':
                agg_expr = polars_value.median()
            case 'min':
                agg_expr = polars_value.min()
            case 'max':
                agg_expr = polars_value.max()
            case 'std':
                agg_expr = polars_value.std()
            case 'var':
                agg_expr = polars_value.var()
            case 'count':
                agg_expr = polars_value.count()
            case 'first':
                agg_expr = polars_value.first()
            case 'last':
                agg_expr = polars_value.last()
            case 'n_unique':
                agg_expr = polars_value.n_unique()
            case _:
                raise ValueError(f"Unsupported window operation: {self.operation}")

        if polars_partitions:
            return agg_expr.over(polars_partitions)
        else:
            return agg_expr
