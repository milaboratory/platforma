import unittest
import polars as pl

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, Unique, TableSpace
from ptabler.expression import StartsWithSelectorExpression, ByNameSelectorExpression

global_settings = GlobalSettings(root_folder=".")


class UniqueTests(unittest.TestCase):
    def test_removes_duplicate_rows(self):
        initial_df = pl.DataFrame(
            {"id": [1, 2, 2, 3, 3, 3], "name": ["a", "b", "b", "c", "c", "c"]}
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 3)
        self.assertEqual(set(result["id"].to_list()), {1, 2, 3})
        self.assertEqual(set(result["name"].to_list()), {"a", "b", "c"})

    def test_all_unique_rows(self):
        initial_df = pl.DataFrame({"id": [1, 2, 3], "name": ["a", "b", "c"]}).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 3)

    def test_empty_table(self):
        initial_df = pl.DataFrame(
            {"id": pl.Series([], dtype=pl.Int64), "name": pl.Series([], dtype=pl.Utf8)}
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 0)

    def test_single_row(self):
        initial_df = pl.DataFrame({"id": [1], "name": ["a"]}).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 1)

    def test_all_duplicates(self):
        initial_df = pl.DataFrame({"id": [1, 1, 1], "name": ["a", "a", "a"]}).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 1)
        self.assertEqual(result["id"][0], 1)
        self.assertEqual(result["name"][0], "a")

    def test_with_null_values(self):
        initial_df = pl.DataFrame(
            {"id": [1, None, None, 2], "name": ["a", "b", "b", "c"]}
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 3)

    def test_partial_match_not_duplicate(self):
        initial_df = pl.DataFrame({"id": [1, 1, 2], "name": ["a", "b", "a"]}).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 3)

    def test_preserves_column_types(self):
        initial_df = pl.DataFrame(
            {
                "int_col": [1, 1, 2],
                "float_col": [1.5, 1.5, 2.5],
                "str_col": ["a", "a", "b"],
                "bool_col": [True, True, False],
            }
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 2)
        self.assertEqual(result.schema["int_col"], pl.Int64)
        self.assertEqual(result.schema["float_col"], pl.Float64)
        self.assertEqual(result.schema["str_col"], pl.Utf8)
        self.assertEqual(result.schema["bool_col"], pl.Boolean)

    def test_subset_single_column(self):
        initial_df = pl.DataFrame({"id": [1, 1, 2], "name": ["a", "b", "c"]}).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output", subset="id")
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 2)
        self.assertEqual(set(result["id"].to_list()), {1, 2})

    def test_subset_multiple_columns(self):
        initial_df = pl.DataFrame(
            {"id": [1, 1, 1], "cat": ["a", "a", "b"], "value": [10, 20, 30]}
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(input_table="input", output_table="output", subset=["id", "cat"])
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 2)

    def test_keep_first(self):
        initial_df = pl.DataFrame({"id": [1, 1, 1], "value": [10, 20, 30]}).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(
            input_table="input",
            output_table="output",
            subset="id",
            keep="first",
            maintain_order=True,
        )
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 1)
        self.assertEqual(result["value"][0], 10)

    def test_keep_last(self):
        initial_df = pl.DataFrame({"id": [1, 1, 1], "value": [10, 20, 30]}).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(
            input_table="input",
            output_table="output",
            subset="id",
            keep="last",
            maintain_order=True,
        )
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 1)
        self.assertEqual(result["value"][0], 30)

    def test_keep_none(self):
        initial_df = pl.DataFrame(
            {"id": [1, 1, 2, 3, 3], "value": [10, 20, 30, 40, 50]}
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(
            input_table="input",
            output_table="output",
            subset="id",
            keep="none",
        )
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 1)
        self.assertEqual(result["id"][0], 2)
        self.assertEqual(result["value"][0], 30)

    def test_maintain_order(self):
        initial_df = pl.DataFrame(
            {"id": [3, 1, 2, 1, 3], "value": ["c", "a", "b", "a2", "c2"]}
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(
            input_table="input",
            output_table="output",
            subset="id",
            keep="first",
            maintain_order=True,
        )
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 3)
        self.assertEqual(result["id"].to_list(), [3, 1, 2])
        self.assertEqual(result["value"].to_list(), ["c", "a", "b"])

    def test_subset_with_selector_starts_with(self):
        initial_df = pl.DataFrame(
            {"id_a": [1, 1, 2], "id_b": [1, 2, 1], "value": ["x", "y", "z"]}
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(
            input_table="input",
            output_table="output",
            subset=StartsWithSelectorExpression(prefix="id_"),
        )
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 3)

    def test_subset_with_selector_by_name(self):
        initial_df = pl.DataFrame(
            {"a": [1, 1, 2], "b": [1, 1, 1], "c": ["x", "y", "z"]}
        ).lazy()
        initial_table_space: TableSpace = {"input": initial_df}
        step = Unique(
            input_table="input",
            output_table="output",
            subset=ByNameSelectorExpression(names=["a"]),
            keep="first",
            maintain_order=True,
        )
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space,
        )
        result = ctx.get_table("output").collect()
        self.assertEqual(len(result), 2)
        self.assertEqual(result["a"].to_list(), [1, 2])
        self.assertEqual(result["c"].to_list(), ["x", "z"])


if __name__ == "__main__":
    unittest.main()
