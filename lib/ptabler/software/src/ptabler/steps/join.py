import polars as pl
from typing import Literal, Optional, List
from msgspec import Struct

from .base import GlobalSettings, PStep, TableSpace


class ColumnMapping(Struct):
    column: str
    rename: Optional[str] = None


class Join(PStep, tag="join"):
    """
    PStep to join two tables from the tablespace.

    Corresponds to the JoinStep or CrossJoinStep defined in the TypeScript type definitions.
    """
    left_table: str
    right_table: str
    output_table: str
    how: Literal["inner", "left", "right", "full", "cross"]
    # Optional, as not needed for cross join
    left_on: Optional[list[str]] = None
    # Optional, as not needed for cross join
    right_on: Optional[list[str]] = None
    # Optional fields to select and rename columns
    left_columns: Optional[List[ColumnMapping]] = None
    right_columns: Optional[List[ColumnMapping]] = None
    # Determines how to handle key columns with the same name from both tables.
    # Defaults to True, which means Polars will attempt to merge them.
    # Set to False to keep them separate (e.g., with a suffix on the right table's column).
    # This mirrors Polars' join coalesce behavior.
    coalesce: bool = True

    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
        """
        Executes the join step.

        Args:
            table_space: The current tablespace containing named LazyFrames.
            global_settings: Global settings for the workflow.

        Returns:
            A tuple containing the updated tablespace and an empty list (as this is not a sink operation).

        Raises:
            ValueError: If input tables are not found or if join keys are missing for non-cross joins.
        """
        if self.left_table not in table_space:
            raise ValueError(
                f"Left table '{self.left_table}' not found in tablespace. "
                f"Available tables: {list(table_space.keys())}"
            )
        if self.right_table not in table_space:
            raise ValueError(
                f"Right table '{self.right_table}' not found in tablespace. "
                f"Available tables: {list(table_space.keys())}"
            )

        left_lf = table_space[self.left_table]
        right_lf = table_space[self.right_table]

        left_mapping = {}
        right_mapping = {}
        if self.left_columns is not None:
            select_expressions = []
            # Tracks the final names of columns that will be produced by explicit mappings
            selected_final_names = set()

            # Process explicit column mappings
            for mapping in self.left_columns:
                original_name = mapping.column
                final_name = mapping.rename if mapping.rename is not None else original_name
                select_expressions.append(pl.col(original_name).alias(final_name))
                left_mapping[original_name] = final_name
                selected_final_names.add(final_name)
            
            # Ensure join keys (original names from self.left_on) are included if not already covered by explicit mappings
            if self.left_on:
                for original_ln_key_name in self.left_on:
                    if original_ln_key_name not in left_mapping: # If original key not in explicit column mappings
                        select_expressions.append(pl.col(original_ln_key_name)) # then identity select it

            left_lf = left_lf.select(select_expressions)

        if self.right_columns is not None:
            select_expressions_right = []
            selected_final_names_right = set()

            for mapping in self.right_columns:
                original_name = mapping.column
                final_name = mapping.rename if mapping.rename is not None else original_name
                select_expressions_right.append(pl.col(original_name).alias(final_name))
                right_mapping[original_name] = final_name
                selected_final_names_right.add(final_name)

            if self.right_on:
                for original_rn_key_name in self.right_on:
                    if original_rn_key_name not in right_mapping: # If original key not in explicit column mappings
                        select_expressions_right.append(pl.col(original_rn_key_name)) # then identity select it
            
            right_lf = right_lf.select(select_expressions_right)


        joined_lf: pl.LazyFrame

        if self.how == "cross":
            joined_lf = left_lf.join(right_lf, how="cross", maintain_order="left_right") # Added maintain_order from user edit
        else:
            if not self.left_on:
                raise ValueError(f"Missing 'left_on' for '{self.how}' join.")
            if not self.right_on:
                raise ValueError(f"Missing 'right_on' for '{self.how}' join.")

            current_left_on = [left_mapping.get(key, key) for key in self.left_on]
            current_right_on = [right_mapping.get(key, key) for key in self.right_on]

            joined_lf = left_lf.join(
                right_lf,
                left_on=current_left_on, # Should be the final names, present in the selected left_lf
                right_on=current_right_on, # Should be the final names, present in the selected right_lf
                how=self.how,
                maintain_order="left_right",
                coalesce=self.coalesce # Pass the coalesce flag to Polars
            )

        updated_table_space = table_space.copy()
        updated_table_space[self.output_table] = joined_lf

        return updated_table_space, []
