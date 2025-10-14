import polars as pl
import msgspec
from typing import List

from .base import PStep, StepContext
from ..expression import AnyExpression


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
            pl.col("123").name.map(lambda x: x + "123")

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
    columns: List[str] # List of column names to exclude

    def execute(self, ctx: StepContext):
        lf_input = ctx.get_table(self.input_table)

        # Polars' exclude method takes a list of column names to remove.
        # If self.columns is empty, it effectively does nothing, which is fine.
        lf_output = lf_input.select(pl.all().exclude(self.columns))

        ctx.put_table(self.output_table, lf_output)
