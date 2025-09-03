from typing import Optional
import unittest
import polars as pl
from polars.testing import assert_frame_equal

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, Concatenate, TableSpace

# Minimal global_settings for tests
global_settings = GlobalSettings(root_folder=".")


class ConcatenateStepTests(unittest.TestCase):

    def setUp(self):
        """Setup common data for concatenation tests."""
        self.df1 = pl.DataFrame({
            "id": [1, 2],
            "name": ["Alice", "Bob"],
            "value": [100, 200]
        }).lazy()

        self.df2 = pl.DataFrame({
            "id": [3, 4],
            "name": ["Charlie", "David"],
            "value": [300, 400]
        }).lazy()
        
        self.df3_extra_col = pl.DataFrame({
            "id": [5, 6],
            "name": ["Eve", "Frank"],
            "value": [500, 600],
            "extra_col": ["ex1", "ex2"]
        }).lazy()

        self.df4_different_order = pl.DataFrame({
            "value": [700, 800],
            "id": [7, 8],
            "name": ["Grace", "Heidi"]
        }).lazy()
        
        self.df5_missing_value_col = pl.DataFrame({
            "id": [9, 10],
            "name": ["Ivan", "Judy"]
            # "value" column is missing
        }).lazy()

        self.initial_table_space: TableSpace = {
            "table1": self.df1,
            "table2": self.df2,
            "table3_extra": self.df3_extra_col,
            "table4_order": self.df4_different_order,
            "table5_missing": self.df5_missing_value_col
        }

    def _execute_concat_workflow(self, concat_step: Concatenate, initial_space_override: Optional[TableSpace] = None) -> pl.DataFrame:
        """Helper to execute a workflow with a single concatenate step."""
        workflow = PWorkflow(workflow=[concat_step])
        space_to_use = initial_space_override if initial_space_override is not None else self.initial_table_space.copy()
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=space_to_use
        )
        self.assertTrue(concat_step.output_table in final_table_space)
        return final_table_space[concat_step.output_table].collect()

    def test_basic_concatenation(self):
        """Tests basic concatenation of two tables with all columns."""
        concat_step = Concatenate(
            input_tables=["table1", "table2"],
            output_table="concatenated_basic"
        )
        result_df = self._execute_concat_workflow(concat_step)

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "name": ["Alice", "Bob", "Charlie", "David"],
            "value": [100, 200, 300, 400]
        })
        assert_frame_equal(result_df.sort("id"), expected_df.sort("id"), check_dtypes=True)

    def test_concatenation_with_column_selection(self):
        """Tests concatenation with a global selection of columns."""
        concat_step = Concatenate(
            input_tables=["table1", "table3_extra"],
            output_table="concatenated_selected_cols",
            columns=["id", "name"]
        )
        result_df = self._execute_concat_workflow(concat_step)

        expected_df = pl.DataFrame({
            "id": [1, 2, 5, 6],
            "name": ["Alice", "Bob", "Eve", "Frank"]
        })
        # Ensure 'value' and 'extra_col' are not present
        self.assertNotIn("value", result_df.columns)
        self.assertNotIn("extra_col", result_df.columns)
        assert_frame_equal(result_df.sort("id"), expected_df.sort("id"), check_dtypes=True)

    def test_concatenation_different_column_order(self):
        """Tests concatenation when input tables have columns in different orders,
        by specifying the desired output column order to the step."""
        concat_step = Concatenate(
            input_tables=["table1", "table4_order"],
            output_table="concatenated_col_order",
            columns=["id", "name", "value"]  # Explicitly define the column order
        )
        result_df = self._execute_concat_workflow(concat_step)

        expected_df = pl.DataFrame({
            "id": [1, 2, 7, 8],
            "name": ["Alice", "Bob", "Grace", "Heidi"],
            "value": [100, 200, 700, 800]
        })
        # Columns are now explicitly selected in the order ["id", "name", "value"]
        assert_frame_equal(result_df.sort("id"), expected_df.select(["id", "name", "value"]).sort("id"), check_dtypes=True)
    
    def test_error_input_table_not_found(self):
        """Tests that a ValueError is raised if an input table is not found."""
        concat_step = Concatenate(
            input_tables=["table1", "non_existent_table"],
            output_table="concatenated_error"
        )
        with self.assertRaisesRegex(ValueError, "Input table 'non_existent_table' not found in tablespace."):
            self._execute_concat_workflow(concat_step)

    def test_error_empty_input_tables_list(self):
        """Tests that a ValueError is raised if the input_tables list is empty."""
        concat_step = Concatenate(
            input_tables=[],
            output_table="concatenated_error_empty"
        )
        with self.assertRaisesRegex(ValueError, "The 'input_tables' list cannot be empty for concatenation."):
            self._execute_concat_workflow(concat_step)

    def test_error_selected_column_missing_in_one_table(self):
        """Tests error when a selected column is missing from one input table."""
        concat_step = Concatenate(
            input_tables=["table1", "table5_missing"], # table5_missing does not have 'value'
            output_table="concatenated_error_missing_col",
            columns=["id", "name", "value"] # 'value' is selected
        )
        # Polars' select step (within concat) will raise ColumnNotFoundError
        with self.assertRaises(pl.exceptions.ColumnNotFoundError):
            self._execute_concat_workflow(concat_step)

if __name__ == '__main__':
    unittest.main()
