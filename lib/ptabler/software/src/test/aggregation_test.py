import unittest
import polars as pl
from polars.testing import assert_frame_equal

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, Aggregate, TableSpace
# Assuming MaxBy is imported from here
from ptabler.steps.aggregate import Sum, MaxBy
from ptabler.expression import ColumnReferenceExpression, ConstantValueExpression

# Minimal global_settings for tests
global_settings = GlobalSettings(root_folder=".")


class AggregationStepTests(unittest.TestCase):

    def test_simple_aggregation_sum(self):
        """
        Tests Aggregate step with a simple sum aggregation.
        Calculates sum of 'value' grouped by 'category'.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "category": ["A", "B", "A", "B"],
            "value": [10, 20, 30, 40]
        }).lazy()
        initial_table_space: TableSpace = {"input_data": initial_df}

        aggregate_step = Aggregate(
            input_table="input_data",
            output_table="aggregated_data",
            group_by=["category"],
            aggregations=[
                Sum(
                    name="value_sum",
                    expression=ColumnReferenceExpression(name="value")
                )
            ]
        )

        workflow = PWorkflow(workflow=[aggregate_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "category": ["A", "B"],
            "value_sum": [40, 60]
        }).sort("category")

        self.assertTrue("aggregated_data" in final_table_space)
        result_df = final_table_space["aggregated_data"].collect().sort(
            "category")
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_max_by_aggregation(self):
        """
        Tests Aggregate step with MaxBy aggregation.
        Finds the 'item_id' that has the maximum 'score' within each 'group'.
        """
        initial_df = pl.DataFrame({
            "group": ["X", "X", "Y", "Y", "X", "Y"],
            "item_id": [101, 102, 201, 202, 103, 203],
            "score": [10, 25, 15, 5, 20, 30]
        }).lazy()
        initial_table_space: TableSpace = {"source_table": initial_df}

        aggregate_step = Aggregate(
            input_table="source_table",
            output_table="max_score_items",
            group_by=["group"],
            aggregations=[
                MaxBy(
                    name="item_with_max_score",
                    expression=ColumnReferenceExpression(name="item_id"),
                    by=[ColumnReferenceExpression(name="score"),ColumnReferenceExpression(name="item_id")]
                )
            ]
        )

        workflow = PWorkflow(workflow=[aggregate_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "group": ["X", "Y"],
            "item_with_max_score": [102, 203]  # item_id for max score
        }).sort("group")

        self.assertTrue("max_score_items" in final_table_space)
        result_df = final_table_space["max_score_items"].collect().sort(
            "group")
        assert_frame_equal(result_df, expected_df, check_dtypes=True)


if __name__ == '__main__':
    unittest.main()
