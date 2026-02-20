import unittest
import polars as pl
from typing import List, Tuple

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, Select, TableSpace
from ptabler.expression import (
    AllSelectorExpression, StringSelectorExpression, NumericSelectorExpression,
    IntegerSelectorExpression, FloatSelectorExpression, StartsWithSelectorExpression,
    EndsWithSelectorExpression, ContainsSelectorExpression, MatchesSelectorExpression,
    ExcludeSelectorExpression, ByNameSelectorExpression, NestedSelectorExpression,
    SelectorComplementExpression, SelectorUnionExpression, SelectorIntersectionExpression,
    SelectorDifferenceExpression, SelectorSymmetricDifferenceExpression
)
from ptabler.common import PType, toPolarsType

global_settings = GlobalSettings(root_folder=".")


class SelectorTests(unittest.TestCase):

    def _test_selector(self, columns: List[Tuple[str, PType]], selector, expected_columns: List[str]):
        """
        Helper method to test selectors with typed columns.
        
        Args:
            columns: List of (column_name, type) pairs
            selector: Selector expression to test
            expected_columns: Expected list of column names after selection
        """
        df_columns = []
        for col_name, col_type in columns:
            df_columns.append(pl.lit(None).alias(col_name).cast(toPolarsType(col_type)))
        initial_df = pl.DataFrame().with_columns(df_columns).lazy()
        
        initial_table_space: TableSpace = {"test_table": initial_df}
        step = Select(
            input_table="test_table",
            output_table="result_table",
            columns=[selector]
        )
        workflow = PWorkflow(workflow=[step])
        ctx = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )
        result_df = ctx.get_table("result_table").collect()
        
        self.assertEqual(sorted(result_df.columns), sorted(expected_columns))

    def test_all_selector(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int")],
            AllSelectorExpression(),
            ["age", "id", "name"],
        )

    def test_string_selector(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int")],
            StringSelectorExpression(),
            ["name"],
        )

    def test_numeric_selector(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int"), ("score", "Float")],
            NumericSelectorExpression(),
            ["age", "id", "score"],
        )

    def test_integer_selector(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int"), ("score", "Float")],
            IntegerSelectorExpression(),
            ["age", "id"],
        )

    def test_float_selector(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int"), ("score", "Float")],
            FloatSelectorExpression(),
            ["score"],
        )

    def test_starts_with_selector(self):
        self._test_selector(
            [("user_id", "Int"), ("user_name", "String"), ("age", "Int")],
            StartsWithSelectorExpression(prefix="user_"),
            ["user_id", "user_name"],
        )

    def test_ends_with_selector(self):
        self._test_selector(
            [("user_id", "Int"), ("name_id", "String"), ("age", "Int")],
            EndsWithSelectorExpression(suffix="_id"),
            ["name_id", "user_id"],
        )

    def test_contains_selector(self):
        self._test_selector(
            [("user_id", "Int"), ("user_name", "String"), ("age", "Int")],
            ContainsSelectorExpression(substring="name"),
            ["user_name"],
        )

    def test_matches_selector(self):
        self._test_selector(
            [("col1", "Int"), ("col2", "String"), ("test_col", "Int")],
            MatchesSelectorExpression(pattern=r"col\d+"),
            ["col1", "col2"],
        )

    def test_exclude_selector(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int")],
            ExcludeSelectorExpression(columns=["id"]),
            ["age", "name"],
        )

    def test_by_name_selector(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int")],
            ByNameSelectorExpression(names=["id", "name"]),
            ["id", "name"],
        )

    def test_nested_selector(self):
        self._test_selector(
            [("id", "Int"), ("data", "String")],
            NestedSelectorExpression(),
            [],
        )

    def test_selector_complement(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int")],
            SelectorComplementExpression(
                selector=StringSelectorExpression()
            ),
            ["age", "id"],
        )

    def test_selector_union(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int"), ("score", "Float")],
            SelectorUnionExpression(
                selectors=[
                    StringSelectorExpression(),
                    FloatSelectorExpression()
                ]
            ),
            ["name", "score"],
        )

    def test_selector_intersection(self):
        self._test_selector(
            [("user_id", "Int"), ("user_name", "String"), ("age", "Int")],
            SelectorIntersectionExpression(
                selectors=[
                    StartsWithSelectorExpression(prefix="user_"),
                    NumericSelectorExpression()
                ]
            ),
            ["user_id"],
        )

    def test_selector_difference(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int")],
            SelectorDifferenceExpression(
                selectors=[
                    NumericSelectorExpression(),
                    ByNameSelectorExpression(names=["id"])
                ]
            ),
            ["age"],
        )

    def test_selector_symmetric_difference(self):
        self._test_selector(
            [("id", "Int"), ("name", "String"), ("age", "Int"), ("score", "Float")],
            SelectorSymmetricDifferenceExpression(
                selectors=[
                    NumericSelectorExpression(),
                    IntegerSelectorExpression()
                ]
            ),
            ["score"],
        )


if __name__ == '__main__':
    unittest.main()
