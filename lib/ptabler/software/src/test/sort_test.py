import unittest
import polars as pl
from polars.testing import assert_frame_equal
from typing import Optional

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, TableSpace, Sort
from ptabler.steps.sort import SortDirective
from ptabler.expression import ColumnReferenceExpression

# Minimal global_settings for tests
global_settings = GlobalSettings(root_folder=".")


class SortStepTests(unittest.TestCase):

    def setUp(self):
        """Setup common data for sort tests."""
        self.basic_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "category": ["B", "A", "B", "C", "A"],
            "value": [10, 5, 15, 10, 20]
        }).lazy()

        self.null_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5, 6],
            "value": [10.0, None, 5.0, 15.0, None, 10.0]
        }).lazy()
        
        self.stability_df = pl.DataFrame({
            "key": [1, 2, 1, 2, 1],
            "original_order": [101, 102, 103, 104, 105], # Proxy for original row order
            "data": ["A", "B", "C", "D", "E"]
        }).lazy()

        self.initial_table_space_basic: TableSpace = {"input_data": self.basic_df}
        self.initial_table_space_null: TableSpace = {"input_data_null": self.null_df}
        self.initial_table_space_stability: TableSpace = {"input_data_stability": self.stability_df}

    def _execute_sort_workflow(self, sort_step: Sort, initial_space: TableSpace) -> pl.DataFrame:
        """Helper to execute a workflow with a single sort step."""
        workflow = PWorkflow(workflow=[sort_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_space.copy()
        )
        self.assertTrue(sort_step.output_table in final_table_space)
        return final_table_space[sort_step.output_table].collect()

    def test_single_column_ascending(self):
        sort_step = Sort(
            input_table="input_data",
            output_table="sorted_output",
            by=[SortDirective(value=ColumnReferenceExpression(name="value"))] # Default ascending, default nulls
        )
        result_df = self._execute_sort_workflow(sort_step, self.initial_table_space_basic)
        expected_df = pl.DataFrame({
            "id": [2, 1, 4, 3, 5],
            "category": ["A", "B", "C", "B", "A"],
            "value": [5, 10, 10, 15, 20]
        })
        assert_frame_equal(result_df, expected_df, check_dtypes=False)

    def test_single_column_descending(self):
        sort_step = Sort(
            input_table="input_data",
            output_table="sorted_output",
            by=[SortDirective(value=ColumnReferenceExpression(name="value"), descending=True)]
        )
        result_df = self._execute_sort_workflow(sort_step, self.initial_table_space_basic)
        expected_df = pl.DataFrame({
            "id": [5, 3, 1, 4, 2],
            "category": ["A", "B", "B", "C", "A"],
            "value": [20, 15, 10, 10, 5]
        })
        assert_frame_equal(result_df, expected_df, check_dtypes=False)

    def test_multi_column_sort(self):
        # Sort by category (asc), then value (desc)
        sort_step = Sort(
            input_table="input_data",
            output_table="sorted_output",
            by=[
                SortDirective(value=ColumnReferenceExpression(name="category"), descending=False),
                SortDirective(value=ColumnReferenceExpression(name="value"), descending=True)
            ]
        )
        result_df = self._execute_sort_workflow(sort_step, self.initial_table_space_basic)
        expected_df = pl.DataFrame({
            "id": [5, 2, 3, 1, 4],
            "category": ["A", "A", "B", "B", "C"],
            "value": [20, 5, 15, 10, 10]
        })
        assert_frame_equal(result_df, expected_df, check_dtypes=False)

    def test_nulls_last_ascending(self):
        sort_step = Sort(
            input_table="input_data_null",
            output_table="sorted_output",
            by=[SortDirective(value=ColumnReferenceExpression(name="value"), descending=False, nulls_last=True)]
        )
        result_df = self._execute_sort_workflow(sort_step, self.initial_table_space_null)
        expected_df = pl.DataFrame({
            "id": [3, 1, 6, 4, 2, 5], # Corrected: Was [3, 1, 6, 5, 2]
            "value": [5.0, 10.0, 10.0, 15.0, None, None]
        })
        # Sort by id for nulls for deterministic comparison as their relative order isn't guaranteed otherwise.
        assert_frame_equal(result_df.sort("id", nulls_last=True), expected_df.sort("id", nulls_last=True), check_dtypes=False)


    def test_nulls_first_ascending(self):
        sort_step = Sort(
            input_table="input_data_null",
            output_table="sorted_output",
            by=[SortDirective(value=ColumnReferenceExpression(name="value"), descending=False, nulls_last=False)]
        )
        result_df = self._execute_sort_workflow(sort_step, self.initial_table_space_null)
        expected_df = pl.DataFrame({
            "id": [2, 5, 3, 1, 6, 4],
            "value": [None, None, 5.0, 10.0, 10.0, 15.0]
        })
        assert_frame_equal(result_df.sort("id", nulls_last=False), expected_df.sort("id", nulls_last=False), check_dtypes=False)


    def test_nulls_default_ascending(self):
        # Polars default for ascending: nulls are smallest (nulls_first)
        sort_step = Sort(
            input_table="input_data_null",
            output_table="sorted_output",
            by=[SortDirective(value=ColumnReferenceExpression(name="value"), descending=False, nulls_last=None)] # Explicitly None
        )
        result_df = self._execute_sort_workflow(sort_step, self.initial_table_space_null)
        # Expected same as nulls_first_ascending
        expected_df = pl.DataFrame({
            "id": [2, 5, 3, 1, 6, 4],
            "value": [None, None, 5.0, 10.0, 10.0, 15.0]
        })
        assert_frame_equal(result_df.sort("id", nulls_last=False), expected_df.sort("id", nulls_last=False), check_dtypes=False)

    def test_nulls_default_descending(self):
        # Polars default for descending: nulls are smallest (so they effectively become nulls_last)
        sort_step = Sort(
            input_table="input_data_null",
            output_table="sorted_output",
            by=[SortDirective(value=ColumnReferenceExpression(name="value"), descending=True, nulls_last=None)] # Explicitly None
        )
        result_df = self._execute_sort_workflow(sort_step, self.initial_table_space_null)
        expected_df = pl.DataFrame({
            "id": [4, 1, 6, 3, 2, 5], # Sorted: 15.0, 10.0, 10.0, 5.0, None, None
            "value": [15.0, 10.0, 10.0, 5.0, None, None]
        })
        assert_frame_equal(result_df.sort("id", nulls_last=True), expected_df.sort("id", nulls_last=True), check_dtypes=False)
        
    def test_stable_sort(self):
        sort_step = Sort(
            input_table="input_data_stability",
            output_table="sorted_output",
            by=[SortDirective(value=ColumnReferenceExpression(name="key"), descending=False)]
        )
        result_df = self._execute_sort_workflow(sort_step, self.initial_table_space_stability)
        
        # For key=1, original_order should be 101, 103, 105
        # For key=2, original_order should be 102, 104
        expected_df = pl.DataFrame({
            "key": [1, 1, 1, 2, 2],
            "original_order": [101, 103, 105, 102, 104],
            "data": ["A", "C", "E", "B", "D"]
        }).select(["key", "original_order", "data"]) # Ensure column order

        assert_frame_equal(result_df.select(["key", "original_order", "data"]), expected_df, check_dtypes=False)

    def test_error_input_table_not_found(self):
        sort_step = Sort(
            input_table="non_existent_table",
            output_table="sorted_output",
            by=[SortDirective(value=ColumnReferenceExpression(name="value"))]
        )
        with self.assertRaisesRegex(ValueError, "Input table 'non_existent_table' not found in tablespace."):
            self._execute_sort_workflow(sort_step, self.initial_table_space_basic)

    def test_error_empty_by_list(self):
        sort_step = Sort(
            input_table="input_data",
            output_table="sorted_output",
            by=[] # Empty list of directives
        )
        with self.assertRaisesRegex(ValueError, "The 'by' list of sort directives cannot be empty for the sort step."):
            self._execute_sort_workflow(sort_step, self.initial_table_space_basic)


if __name__ == '__main__':
    unittest.main()
