import polars as pl
import msgspec
from typing import List

from .base import PStep, StepContext
from ..expression import AnyExpression


class ColumnDefinition(msgspec.Struct, frozen=True, rename="camel"):
    """
    Defines a new column to be added to a table.
    It specifies the name of the new column and the expression used to compute its values.
    """
    name: str
    expression: AnyExpression


class AddColumns(PStep, tag="add_columns"):
    """
    PStep to add one or more new columns to an existing table in the tablespace.

    This step retrieves a specified table (LazyFrame) from the tablespace,
    computes new columns based on the provided expressions, and updates the
    table in the tablespace with these new columns.
    Corresponds to the AddColumnsStep defined in the TypeScript type definitions.
    """
    table: str
    columns: List[ColumnDefinition]

    def execute(self, ctx: StepContext):
        """
        Executes the add_columns step.

        Args:
            ctx: StepContext containing methods to manage the table space.

        Raises:
            ValueError: If the specified table is not found in the tablespace.
        """
        lf = ctx.get_table(self.table)

        polars_expressions_to_add = []
        for col_def in self.columns:
            # Each Expression object has a to_polars() method that converts it
            # to a Polars expression. It's then aliased to the new column name.
            polars_expr = col_def.expression.to_polars().alias(col_def.name)
            polars_expressions_to_add.append(polars_expr)

        if polars_expressions_to_add:
            lf = lf.with_columns(polars_expressions_to_add)

        # Update the tablespace with the modified LazyFrame
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
    columns: List[ColumnDefinition]

    def execute(self, ctx: StepContext):
        """
        Executes the select step.

        Args:
            ctx: StepContext containing methods to manage the table space.

        Raises:
            ValueError: If the specified input_table is not found in the tablespace.
        """
        lf_input = ctx.get_table(self.input_table)

        polars_expressions_to_select = []
        if not self.columns:
            # According to Polars docs, select with no arguments is pl.DataFrame() (empty)
            # pl.select([]) also seems to produce an empty df. 
            # If user wants all columns, they should use specific expressions or a future pl.all() like expression.
            # For now, an empty columns list will result in an empty DataFrame for select.
            pass # lf_output will be lf_input.select([]) which is an empty DF
        
        for col_def in self.columns:
            polars_expr = col_def.expression.to_polars().alias(col_def.name)
            polars_expressions_to_select.append(polars_expr)

        lf_output = lf_input.select(polars_expressions_to_select)

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
    columns: List[ColumnDefinition]

    def execute(self, ctx: StepContext):
        """
        Executes the with_columns step.

        Args:
            ctx: StepContext containing methods to manage the table space.

        Raises:
            ValueError: If the specified input_table is not found in the tablespace.
        """
        lf_input = ctx.get_table(self.input_table)

        polars_expressions_to_add = []
        for col_def in self.columns:
            polars_expr = col_def.expression.to_polars().alias(col_def.name)
            polars_expressions_to_add.append(polars_expr)

        # If polars_expressions_to_add is empty, lf.with_columns([]) is a no-op, returning the original lf.
        lf_output = lf_input.with_columns(polars_expressions_to_add)

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
        """
        Executes the without_columns step.

        Args:
            ctx: StepContext containing methods to manage the table space.

        Raises:
            ValueError: If the specified input_table is not found in the tablespace.
        """
        lf_input = ctx.get_table(self.input_table)

        # Polars' exclude method takes a list of column names to remove.
        # If self.columns is empty, it effectively does nothing, which is fine.
        lf_output = lf_input.select(pl.all().exclude(self.columns))

        ctx.put_table(self.output_table, lf_output)
