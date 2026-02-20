import polars as pl
import msgspec
from typing import List, Literal, Optional, Union

from .base import PStep, StepContext
from ..expression import AnyExpression
from ..expression.base import Expression

UniqueKeepStrategy = Literal["any", "none", "first", "last"]


class AddColumns(PStep, tag="add_columns"):
    """
    PStep to add one or more new columns to an existing table in the tablespace.

    This step retrieves a specified table (LazyFrame) from the tablespace,
    computes new columns based on the provided expressions, and updates the
    table in the tablespace with these new columns.
    Corresponds to the AddColumnsStep defined in the TypeScript type definitions.
    """

    table: str
    columns: List[AnyExpression]

    def execute(self, ctx: StepContext):
        lf = ctx.get_table(self.table)

        polars_expressions = [expr.to_polars() for expr in self.columns]
        if polars_expressions:
            lf = lf.with_columns(polars_expressions)

        ctx.put_table(self.table, lf)


class Select(PStep, tag="select"):
    """
    PStep to select a specific set of columns from an input table,
    potentially applying transformations or creating new columns, and outputs
    the result to a new table in the tablespace.
    Corresponds to the SelectStep defined in the TypeScript type definitions.
    """

    input_table: str = msgspec.field(name="inputTable")
    output_table: str = msgspec.field(name="outputTable")
    columns: List[AnyExpression]

    def execute(self, ctx: StepContext):
        lf_input = ctx.get_table(self.input_table)

        polars_expressions = [expr.to_polars() for expr in self.columns]
        lf_output = lf_input.select(polars_expressions)

        ctx.put_table(self.output_table, lf_output)


class Unique(PStep, tag="unique"):
    """
    PStep to remove duplicate rows from an input table and outputs
    the result to a new table in the tablespace.
    Corresponds to the UniqueStep defined in the TypeScript type definitions.

    Parameters:
        input_table: The name of the input table.
        output_table: The name for the resulting unique table.
        subset: Column name(s) or selector expression to consider when identifying duplicates.
                Can be a string, list of strings, or a selector expression.
                If None, all columns are used.
        keep: Which of the duplicate rows to keep:
              - 'any': No guarantee of which row is kept (allows optimizations).
              - 'none': Don't keep duplicate rows.
              - 'first': Keep first unique row.
              - 'last': Keep last unique row.
              Defaults to 'any'.
        maintain_order: Keep the same order as the original data.
                        This may be more expensive. Defaults to False.
    """

    input_table: str = msgspec.field(name="inputTable")
    output_table: str = msgspec.field(name="outputTable")
    subset: Optional[Union[str, List[str], AnyExpression]] = None
    keep: UniqueKeepStrategy = "any"
    maintain_order: bool = msgspec.field(name="maintainOrder", default=False)

    def execute(self, ctx: StepContext):
        lf_input = ctx.get_table(self.input_table)

        # Handle subset: can be string, list of strings, or selector expression
        subset_arg = self.subset
        if isinstance(self.subset, Expression):
            subset_arg = self.subset.to_polars()

        lf_output = lf_input.unique(
            subset=subset_arg,
            keep=self.keep,
            maintain_order=self.maintain_order,
        )
        ctx.put_table(self.output_table, lf_output)


class WithColumns(PStep, tag="with_columns"):
    """
    PStep to add new columns to an input table (or replace existing ones
    if names collide) and outputs the result to a new table in the tablespace.
    All original columns from the input table are retained.
    Corresponds to the WithColumnsStep defined in the TypeScript type definitions.
    """

    input_table: str = msgspec.field(name="inputTable")
    output_table: str = msgspec.field(name="outputTable")
    columns: List[AnyExpression]

    def execute(self, ctx: StepContext):
        lf_input = ctx.get_table(self.input_table)

        polars_expressions = [expr.to_polars() for expr in self.columns]
        lf_output = lf_input.with_columns(polars_expressions)

        ctx.put_table(self.output_table, lf_output)


class WithoutColumns(PStep, tag="without_columns"):
    """
    PStep to exclude a specific set of columns from an input table and outputs
    the result to a new table in the tablespace.
    Corresponds to the WithoutColumnsStep defined in the TypeScript type definitions.
    """

    input_table: str = msgspec.field(name="inputTable")
    output_table: str = msgspec.field(name="outputTable")
    columns: List[str]  # List of column names to exclude

    def execute(self, ctx: StepContext):
        lf_input = ctx.get_table(self.input_table)

        # Polars' exclude method takes a list of column names to remove.
        # If self.columns is empty, it effectively does nothing, which is fine.
        lf_output = lf_input.select(pl.all().exclude(self.columns))

        ctx.put_table(self.output_table, lf_output)
