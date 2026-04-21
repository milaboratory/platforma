import unittest
import polars as pl
from polars.testing import assert_frame_equal

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, TableSpace, Slice

global_settings = GlobalSettings(root_folder=".")


class SliceTests(unittest.TestCase):
    def _make_test_df(self) -> pl.LazyFrame:
        return pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "value": [10, 20, 30, 40, 50],
        }).lazy()

    def _run_slice(self, offset: int, length: int) -> pl.DataFrame:
        initial_table_space: TableSpace = {"input_data": self._make_test_df()}
        step = Slice(
            input_table="input_data",
            output_table="sliced_data",
            offset=offset,
            length=length,
        )
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space.copy(),
        )
        return ctx.get_table("sliced_data").collect()

    def test_basic_range(self):
        result = self._run_slice(offset=1, length=2)
        expected = pl.DataFrame({"id": [2, 3], "value": [20, 30]})
        assert_frame_equal(result, expected)

    def test_offset_past_end_returns_empty(self):
        result = self._run_slice(offset=10, length=5)
        self.assertEqual(result.height, 0)
        self.assertEqual(result.columns, ["id", "value"])

    def test_length_exceeds_row_count_returns_tail(self):
        result = self._run_slice(offset=3, length=10)
        expected = pl.DataFrame({"id": [4, 5], "value": [40, 50]})
        assert_frame_equal(result, expected)

    def test_offset_zero_full_length(self):
        result = self._run_slice(offset=0, length=5)
        expected = self._make_test_df().collect()
        assert_frame_equal(result, expected)
