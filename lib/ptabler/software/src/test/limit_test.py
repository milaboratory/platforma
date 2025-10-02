import unittest
import polars as pl
from polars.testing import assert_frame_equal

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, TableSpace, Limit

global_settings = GlobalSettings(root_folder=".")


class LimitTests(unittest.TestCase):
    def test_limit_step(self):
        test_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            "category": ["A", "B", "A", "C", "B", "A", "C", "B", "A", "C"],
            "value": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        }).lazy()

        initial_table_space: TableSpace = {"input_data": test_df}
        limit_step = Limit(
            input_table="input_data",
            output_table="limited_data",
            n=5
        )
        workflow = PWorkflow(workflow=[limit_step])

        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space.copy()
        )
        result = ctx.get_table("limited_data").collect()
        
        expected = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "category": ["A", "B", "A", "C", "B"],
            "value": [10, 20, 30, 40, 50]
        })
        assert_frame_equal(result, expected)
