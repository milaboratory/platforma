import polars as pl
import msgspec

from .base import GlobalSettings, PStep, TableSpace
from ..expression import AnyExpression


class Filter(PStep, tag="filter"):
    """
    PStep to filter rows in a table based on a specified condition.

    This step retrieves a specified table (LazyFrame) from the tablespace,
    applies a filter condition, and stores the resulting filtered table
    under a new name in the tablespace.
    Corresponds to the FilterStep defined in the TypeScript type definitions.
    """
    input_table: str
    output_table: str
    condition: AnyExpression


    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
        """
        Executes the filter step.

        Args:
            table_space: The current tablespace containing named LazyFrames.
            global_settings: Global settings for the workflow.

        Returns:
            A tuple containing the updated tablespace and an empty list (as this is not a sink operation).
        
        Raises:
            ValueError: If the specified input_table is not found in the tablespace.
        """
        if self.input_table not in table_space:
            raise ValueError(
                f"Table '{self.input_table}' not found in tablespace. "
                f"Available tables: {list(table_space.keys())}"
            )

        lf = table_space[self.input_table]

        # Convert the condition Expression to a Polars expression
        polars_condition = self.condition.to_polars()

        # Apply the filter
        filtered_lf = lf.filter(polars_condition)

        # Update the tablespace with the new filtered LazyFrame
        updated_table_space = table_space.copy()
        updated_table_space[self.output_table] = filtered_lf
        
        return updated_table_space, []
