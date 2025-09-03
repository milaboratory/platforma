import polars as pl
import msgspec
from typing import List, Optional

from .base import GlobalSettings, PStep, TableSpace


class Concatenate(PStep, tag="concatenate"):
    """
    PStep to vertically concatenate multiple tables from the tablespace into a single output table.
    Columns are matched by name. An optional list of columns can be specified to select
    from all input tables before concatenation.

    Corresponds to the ConcatenateStep defined in the TypeScript type definitions.
    """
    input_tables: List[str]
    output_table: str
    columns: Optional[List[str]] = None

    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
        """
        Executes the concatenate step.

        Args:
            table_space: The current tablespace containing named LazyFrames.
            global_settings: Global settings for the workflow.

        Returns:
            A tuple containing the updated tablespace with the concatenated table
            and an empty list (as this is not a sink operation).

        Raises:
            ValueError: If any specified input table is not found in the tablespace,
                        or if input_tables list is empty.
        """
        if not self.input_tables:
            raise ValueError("The 'input_tables' list cannot be empty for concatenation.")

        lfs_to_concat: List[pl.LazyFrame] = []

        for table_name in self.input_tables:
            if table_name not in table_space:
                raise ValueError(
                    f"Input table '{table_name}' not found in tablespace. "
                    f"Available tables: {list(table_space.keys())}"
                )
            
            lf = table_space[table_name]

            if self.columns:
                # If columns are specified, select them. Polars will raise an error during
                # query execution if any specified column does not exist in an input table,
                # which aligns with the expectation that all input tables must contain these columns.
                lf = lf.select(self.columns)
            
            lfs_to_concat.append(lf)

        if not lfs_to_concat:
            # This case should ideally be caught by the initial check on self.input_tables,
            # but as a safeguard:
            raise ValueError("No valid LazyFrames found to concatenate.")

        # Vertically concatenate the LazyFrames.
        # Polars' concat by default uses how='vertical' when given a list of frames.
        # It matches columns by name.
        concatenated_lf = pl.concat(lfs_to_concat, how="vertical")

        updated_table_space = table_space.copy()
        updated_table_space[self.output_table] = concatenated_lf
        
        return updated_table_space, []
