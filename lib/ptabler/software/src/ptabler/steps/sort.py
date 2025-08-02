import polars as pl
import msgspec
from typing import List, Optional

from .base import GlobalSettings, PStep, TableSpace
from ..expression import AnyExpression


class SortDirective(msgspec.Struct, frozen=True, rename="camel"):
    """
    Defines a single sort instruction, specifying the expression, sort order,
    and null handling strategy.
    Corresponds to the SortDirective in TypeScript.
    """
    value: AnyExpression
    descending: Optional[bool] = None  # Defaults to False (ascending)
    nulls_last: Optional[bool] = None # Defaults to Polars default (nulls smallest)


class Sort(PStep, tag="sort"):
    """
    PStep to sort a table based on one or more column directives.
    The operation reads from an input table and writes the sorted result
    to an output table.
    Corresponds to the SortStep defined in the TypeScript type definitions.
    """
    input_table: str
    output_table: str
    by: List[SortDirective]

    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
        """
        Executes the sort step.

        Args:
            table_space: The current tablespace containing named LazyFrames.
            global_settings: Global settings for the workflow.

        Returns:
            A tuple containing the updated tablespace with the sorted table
            and an empty list (as this is not a sink operation).

        Raises:
            ValueError: If the specified input_table is not found in the tablespace,
                        or if 'by' directives list is empty.
        """
        if self.input_table not in table_space:
            raise ValueError(
                f"Input table '{self.input_table}' not found in tablespace. "
                f"Available tables: {list(table_space.keys())}"
            )

        if not self.by:
            raise ValueError("The 'by' list of sort directives cannot be empty for the sort step.")

        lf = table_space[self.input_table]

        sort_by_expressions: List[pl.Expr] = []
        descending_flags: List[bool] = []
        nulls_last_flags: List[bool] = []

        for directive in self.by:
            sort_by_expressions.append(directive.value.to_polars())
            
            current_descending = directive.descending if directive.descending is not None else False
            descending_flags.append(current_descending)

            if directive.nulls_last is not None:
                nulls_last_flags.append(directive.nulls_last)
            else:
                # Polars default: nulls are smallest.
                # If ascending (current_descending=False), nulls first (nulls_last=False).
                # If descending (current_descending=True), nulls last (nulls_last=True).
                # So, if directive.nulls_last is None, it should align with current_descending.
                nulls_last_flags.append(current_descending)
        
        sorted_lf = lf.sort(
            by=sort_by_expressions,
            descending=descending_flags,
            nulls_last=nulls_last_flags,
            maintain_order=True
        )

        updated_table_space = table_space.copy()
        updated_table_space[self.output_table] = sorted_lf
        
        return updated_table_space, []
