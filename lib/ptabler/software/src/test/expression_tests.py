import unittest
import polars as pl
from polars.testing import assert_frame_equal
import math # Added for math.ceil in expected value generation logic

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, AddColumns, Filter, TableSpace
from ptabler.steps.basics import ColumnDefinition
from ptabler.expression import (
    ColumnReferenceExpression, ConstantValueExpression,
    PlusExpression, EqExpression, GtExpression, AndExpression,
    ToUpperExpression, StringJoinExpression, SubstringExpression,
    CumsumExpression, RankExpression, WindowExpression,
    StringDistanceExpression, FuzzyStringFilterExpression,
    WhenThenClause, WhenThenOtherwiseExpression,
    HashExpression,
    StringReplaceExpression,
    StringContainsExpression, StringContainsAnyExpression, StringCountMatchesExpression,
    StringExtractExpression, StringStartsWithExpression, StringEndsWithExpression,
    FillNaExpression,
    UnaryMinusExpression,
)

# Minimal global_settings for tests not relying on file I/O from a specific root_folder
global_settings = GlobalSettings(root_folder=".")


class StepTests(unittest.TestCase):

    def test_add_columns_arithmetic(self):
        """
        Tests AddColumns step with a simple arithmetic expression.
        Adds a column 'c_sum' = col("a") + col("b").
        """
        initial_df = pl.DataFrame({
            "id": [1, 2],
            "a": [10, 20],
            "b": [5, 7]
        }).lazy()
        initial_table_space: TableSpace = {"input_table": initial_df}

        add_col_step = AddColumns(
            table="input_table",
            columns=[
                ColumnDefinition(
                    name="c_sum",
                    expression=PlusExpression(
                        lhs=ColumnReferenceExpression(name="a"),
                        rhs=ColumnReferenceExpression(name="b")
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[add_col_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2],
            "a": [10, 20],
            "b": [5, 7],
            "c_sum": [15, 27]
        })

        result_df = final_table_space["input_table"].collect()
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_filter_with_compound_condition(self):
        """
        Tests Filter step with a compound condition: value > 75 AND category == "A".
        The filtered result is stored in a new table "filtered_output".
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "value": [100, 50, 120, 80],
            "category": ["A", "B", "A", "B"]
        }).lazy()
        initial_table_space: TableSpace = {"source_table": initial_df}

        filter_step = Filter(
            input_table="source_table",
            output_table="filtered_output",
            condition=AndExpression(operands=[
                GtExpression(
                    lhs=ColumnReferenceExpression(name="value"),
                    rhs=ConstantValueExpression(value=75)
                ),
                EqExpression(
                    lhs=ColumnReferenceExpression(name="category"),
                    rhs=ConstantValueExpression(value="A")
                )
            ])
        )

        workflow = PWorkflow(workflow=[filter_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 3],
            "value": [100, 120],
            "category": ["A", "A"]
        })

        self.assertTrue("filtered_output" in final_table_space)
        result_df = final_table_space["filtered_output"].collect()
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

        # Ensure original table is still present and unchanged if needed for other tests,
        # though Filter creates a new one.
        self.assertTrue("source_table" in final_table_space)
        original_df_collected = final_table_space["source_table"].collect()
        assert_frame_equal(original_df_collected, initial_df.collect())

    def test_add_columns_string_operations_sequential(self):
        """
        Tests sequential AddColumns steps with string operations:
        1. Add 'first_upper' = to_upper(col("first"))
        2. Add 'full_name' = str_join([col("first_upper"), const(" "), col("last")])
        """
        initial_df = pl.DataFrame({
            "id": [1, 2],
            "first": ["john", "jane"],
            "last": ["doe", "smith"]
        }).lazy()
        initial_table_space: TableSpace = {"names_table": initial_df}

        add_upper_step = AddColumns(
            table="names_table",
            columns=[
                ColumnDefinition(
                    name="first_upper",
                    expression=ToUpperExpression(
                        value=ColumnReferenceExpression(name="first")
                    )
                )
            ]
        )

        add_full_name_step = AddColumns(
            table="names_table",
            columns=[
                ColumnDefinition(
                    name="full_name",
                    expression=StringJoinExpression(
                        operands=[
                            ColumnReferenceExpression(name="first_upper"),
                            ConstantValueExpression(value=" "),
                            ColumnReferenceExpression(name="last")
                        ],
                        delimiter=""  # Polars concat_str uses this as separator
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[add_upper_step, add_full_name_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2],
            "first": ["john", "jane"],
            "last": ["doe", "smith"],
            "first_upper": ["JOHN", "JANE"],
            "full_name": ["JOHN doe", "JANE smith"]
        })

        result_df = final_table_space["names_table"].collect()
        # Order of columns might differ, so select in expected order for comparison
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_cumsum_expression(self):
        """
        Tests AddColumns step with a CumsumExpression.
        Calculates cumulative sum of 'value' partitioned by 'category' and ordered by 'order_col'.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5, 6],
            "category": ["A", "A", "B", "A", "B", "B"],
            "value": [10, 20, 5, 15, 10, 20],
            "order_col": [1, 2, 1, 3, 2, 3]  # Order within each category
        }).lazy()
        initial_table_space: TableSpace = {"data_table": initial_df}

        cumsum_step = AddColumns(
            table="data_table",
            columns=[
                ColumnDefinition(
                    name="value_cumsum",
                    expression=CumsumExpression(
                        value=ColumnReferenceExpression(name="value"),
                        partition_by=[
                            ColumnReferenceExpression(name="category")],
                        additional_order_by=[
                            ColumnReferenceExpression(name="order_col")],
                        descending=False
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[cumsum_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 4, 3, 5, 6],
            "category": ["A", "A", "A", "B", "B", "B"],
            "value": [10, 20, 15, 5, 10, 20],
            "order_col": [1, 2, 3, 1, 2, 3],
            "value_cumsum": [10, 25, 45, 5, 15, 35]
        })

        result_df = final_table_space["data_table"].collect().sort(
            ["category", "order_col"])
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_rank_expression(self):
        """
        Tests AddColumns step with a RankExpression.
        Ranks 'value' partitioned by 'category', ordered by 'value' (desc) and 'id' (asc).
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5, 6],
            "category": ["A", "B", "A", "B", "A", "B"],
            "value": [100, 200, 150, 200, 100, 300]
        }).lazy()
        initial_table_space: TableSpace = {"data_table": initial_df}

        rank_step = AddColumns(
            table="data_table",
            columns=[
                ColumnDefinition(
                    name="value_rank_desc",
                    expression=RankExpression(
                        order_by=[
                            ColumnReferenceExpression(name="value"),
                            ColumnReferenceExpression(name="id")
                        ],
                        partition_by=[
                            ColumnReferenceExpression(name="category")],
                        descending=True
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[rank_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        result_df_collected = final_table_space["data_table"].collect()

        result_df_sorted = result_df_collected.sort(
            ["category", "value", "id"], descending=[False, True, True])

        expected_df = pl.DataFrame({
            "id": [3, 5, 1, 6, 4, 2],
            "category": ["A", "A", "A", "B", "B", "B"],
            "value":    [150, 100, 100, 300, 200, 200],
            "value_rank_desc": [1, 2, 3, 1, 2, 3]
        }, schema_overrides={"value_rank_desc": pl.UInt32})
        expected_df = expected_df.select(
            result_df_sorted.columns)  # Ensure column order

        assert_frame_equal(result_df_sorted, expected_df, check_dtypes=True)

    def test_string_distance_expression(self):
        """
        Tests AddColumns with StringDistanceExpression for Levenshtein.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3],
            "s1": ["apple", "banana", "orange"],
            "s2": ["apply", "bandana", "apricot"]
        }).lazy()
        initial_table_space: TableSpace = {"strings_table": initial_df}

        add_dist_step = AddColumns(
            table="strings_table",
            columns=[
                ColumnDefinition(
                    name="lev_dist",
                    expression=StringDistanceExpression(
                        metric="levenshtein",
                        string1=ColumnReferenceExpression(name="s1"),
                        string2=ColumnReferenceExpression(name="s2"),
                        return_similarity=False
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[add_dist_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3],
            "s1": ["apple", "banana", "orange"],
            "s2": ["apply", "bandana", "apricot"],
            "lev_dist": [1, 1, 6],  # Exact values
        }, schema_overrides={"lev_dist": pl.UInt32})

        result_df = final_table_space["strings_table"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_hash_expression(self):
        """
        Tests AddColumns with StringDistanceExpression for Levenshtein.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3],
            "s1": ["apple", "banana", "orange"],
            "s2": ["apply", "bandana", "apricot"]
        }).lazy()
        initial_table_space: TableSpace = {"strings_table": initial_df}

        add_dist_step = AddColumns(
            table="strings_table",
            columns=[
                ColumnDefinition(
                    name="s1s2_hash",
                    expression=SubstringExpression(
                        value=ToUpperExpression(HashExpression("sha256", "base64", StringJoinExpression([
                            ColumnReferenceExpression("s1"),
                            ColumnReferenceExpression("s2")
                        ], "_"))),
                        start=ConstantValueExpression(value=0), 
                        length=ConstantValueExpression(value=10)
                    ),
                )
            ]
        )

        workflow = PWorkflow(workflow=[add_dist_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3],
            "s1": ["apple", "banana", "orange"],
            "s2": ["apply", "bandana", "apricot"],
            "s1s2_hash": ["2T0A+DADLH", "YKSEMRPXPM", "ORAT8YELPR"]
        })

        result_df = final_table_space["strings_table"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_hash_expression_advanced(self):
        """
        Tests AddColumns with HashExpression focusing on the 'bits' parameter
        and new base64_alphanumeric/base64_alphanumeric_upper encodings.
        Assertions are changed to check for correct string lengths only for hash columns.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2],
            "text": ["hello_world", "another_test"],
        }).lazy()
        initial_table_space: TableSpace = {"source_table": initial_df}

        # Definitions for hash columns remain the same
        add_hash_cols_step = AddColumns(
            table="source_table",
            columns=[
                ColumnDefinition(
                    name="sha256_hex_16b",
                    expression=HashExpression(
                        hash_type='sha256', encoding='hex',
                        value=ColumnReferenceExpression(name="text"), bits=16)
                ),
                ColumnDefinition(
                    name="sha256_b64_24b",
                    expression=HashExpression(
                        hash_type='sha256', encoding='base64',
                        value=ColumnReferenceExpression(name="text"), bits=24)
                ),
                ColumnDefinition(
                    name="sha256_b64_alnum_30b",
                    expression=HashExpression(
                        hash_type='sha256', encoding='base64_alphanumeric',
                        value=ColumnReferenceExpression(name="text"), bits=30)
                ),
                ColumnDefinition(
                    name="sha256_b64_alnum_upper_30b",
                    expression=HashExpression(
                        hash_type='sha256', encoding='base64_alphanumeric_upper',
                        value=ColumnReferenceExpression(name="text"), bits=30)
                ),
                ColumnDefinition(
                    name="sha256_b64_alnum_full", # No bits, full length after filter
                    expression=HashExpression(
                        hash_type='sha256', encoding='base64_alphanumeric',
                        value=ColumnReferenceExpression(name="text"))
                ),
                ColumnDefinition(
                    name="wyhash_hex_20b", # wyhash produces 64 bits
                    expression=HashExpression(
                        hash_type='wyhash', encoding='hex',
                        value=ColumnReferenceExpression(name="text"), bits=20)
                ),
                ColumnDefinition(
                    name="wyhash_b64_alnum_upper_40b",
                    expression=HashExpression(
                        hash_type='wyhash', encoding='base64_alphanumeric_upper',
                        value=ColumnReferenceExpression(name="text"), bits=40)
                ),
                ColumnDefinition(
                    name="sha256_hex_bits_gt_max", # bits > 256, should use full hash (256 bits for sha256)
                    expression=HashExpression(
                        hash_type='sha256', encoding='hex',
                        value=ColumnReferenceExpression(name="text"), bits=300)
                ),
            ]
        )

        workflow = PWorkflow(workflow=[add_hash_cols_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        result_df = final_table_space["source_table"].collect()

        # 1. Check base columns for exact values
        expected_base_df = pl.DataFrame({
            "id": [1, 2],
            "text": ["hello_world", "another_test"],
        })
        assert_frame_equal(result_df.select(["id", "text"]), expected_base_df, check_dtypes=True)

        # 2. Define expected lengths for hash columns
        # For clarity, _HASH_OUTPUT_BITS from hash.py relevant values:
        # 'sha256': 256, 'wyhash': 64
        expected_lengths = {
            "sha256_hex_16b": math.ceil(16 / 4),
            "sha256_b64_24b": math.ceil(24 / 6),
            "sha256_b64_alnum_30b": math.ceil(30 / 5.95), # Truncation based on original 6 bits/char of Base64
            "sha256_b64_alnum_upper_30b": math.ceil(30 / 5.15), # Same as above
            # For sha256_b64_alnum_full (bits=None): uses full 256 bits.
            # SHA256 (32 bytes) -> Base64 (44 chars with padding) -> filter non-alnum.
            # Common length is 43 (e.g. if one padding char and no internal +/-).
            "sha256_b64_alnum_full": 42,
            "wyhash_hex_20b": math.ceil(20 / 4),
            "wyhash_b64_alnum_upper_40b": math.ceil(40 / 5.15),
            "sha256_hex_bits_gt_max": math.ceil(256 / 4), # bits=300 capped to 256 for sha256
        }

        # 3. Assert lengths for hash columns
        for col_name, expected_len in expected_lengths.items():
            self.assertTrue(col_name in result_df.columns, f"Column {col_name} missing from results.")
            actual_lengths = result_df[col_name].str.len_chars()
            self.assertTrue(
                actual_lengths.eq(expected_len).all(),
                msg=(f"Length mismatch for column '{col_name}'. "
                     f"Expected all to have length {expected_len}, "
                     f"got lengths: {actual_lengths.to_list()}.")
            )

        # 4. Check all expected columns are present
        expected_col_names = sorted(expected_base_df.columns + list(expected_lengths.keys()))
        self.assertListEqual(sorted(result_df.columns), expected_col_names,
                             msg="Final column list does not match expected.")

    def test_fuzzy_string_filter_expression(self):
        """
        Tests Filter step with a FuzzyStringFilterExpression using Levenshtein distance.
        Filters names that are <= 2 Levenshtein distance from "Michael".
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "name": ["Michael", "Micheal", "Miguel", "Michelle", "Robert"]
        }).lazy()
        initial_table_space: TableSpace = {"names_to_filter": initial_df}

        # Levenshtein distances from "Michael":
        # "Michael": 0
        # "Micheal": 1 (ea swap)
        # "Miguel":  3
        # "Michelle": 3
        # "Robert": >2 (e.g., 5 or 6)

        fuzzy_filter_step = Filter(
            input_table="names_to_filter",
            output_table="filtered_names",
            condition=FuzzyStringFilterExpression(
                metric="levenshtein",
                value=ColumnReferenceExpression(name="name"),
                pattern=ConstantValueExpression(value="Michael"),
                bound=2  # Max distance of 2
            )
        )

        workflow = PWorkflow(workflow=[fuzzy_filter_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2],  # Robert, Miguel, Michelle should be filtered out
            "name": ["Michael", "Micheal"]
        })

        self.assertTrue("filtered_names" in final_table_space)
        result_df = final_table_space["filtered_names"].collect()
        result_df = result_df.sort("id")
        expected_df = expected_df.sort("id")

        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_add_columns_with_conditional_expression(self):
        """
        Tests AddColumns step with a WhenThenOtherwiseExpression.
        Categorizes a 'value' column into 'High', 'Medium', or 'Low'.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "value": [200, 75, 30, 100, 50]
        }).lazy()
        initial_table_space: TableSpace = {"source_data": initial_df}

        conditional_step = AddColumns(
            table="source_data",
            columns=[
                ColumnDefinition(
                    name="category",
                    expression=WhenThenOtherwiseExpression(
                        conditions=[
                            WhenThenClause(
                                when=GtExpression(
                                    lhs=ColumnReferenceExpression(
                                        name="value"),
                                    rhs=ConstantValueExpression(value=100)
                                ),
                                then=ConstantValueExpression(value="High")
                            ),
                            WhenThenClause(
                                when=GtExpression(
                                    lhs=ColumnReferenceExpression(
                                        name="value"),
                                    rhs=ConstantValueExpression(value=50)
                                ),
                                then=ConstantValueExpression(value="Medium")
                            )
                        ],
                        otherwise=ConstantValueExpression(value="Low")
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[conditional_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "value": [200, 75, 30, 100, 50],
            "category": ["High", "Medium", "Low", "Medium", "Low"]
            # value=200 -> High (>100)
            # value=75  -> Medium (>50)
            # value=30  -> Low (else)
            # value=100 -> Medium (>50, not >100)
            # value=50  -> Low (else, not >50)
        })

        result_df = final_table_space["source_data"].collect()
        # Ensure column order for comparison
        result_df = result_df.select(expected_df.columns)
        result_df = result_df.sort("id")
        expected_df = expected_df.sort("id")

        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_add_columns_with_string_replace_expression(self):
        """
        Tests AddColumns step with a StringReplaceExpression.
        Replaces 'name: <name>, age: <age>' with 'Person: <name>, Years: <age>'.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3],
            "text_col": ["name: John Doe, age: 30", "name: Jane Smith, age: 25", "name: Bob Johnson, age: 40"]
        }).lazy()
        initial_table_space: TableSpace = {"source_data": initial_df}

        replace_step = AddColumns(
            table="source_data",
            columns=[
                ColumnDefinition(
                    name="replace_capture_groups",
                    expression=StringReplaceExpression(
                        value=ColumnReferenceExpression(name="text_col"),
                        pattern=r"name: (\w+\s\w+), age: (\d+)",
                        replacement="Person: $1, Years: $2"
                        # replace_all=False (default), literal=False (default)
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[replace_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3],
            "text_col": ["name: John Doe, age: 30", "name: Jane Smith, age: 25", "name: Bob Johnson, age: 40"],
            "replace_capture_groups": ["Person: John Doe, Years: 30", "Person: Jane Smith, Years: 25", "Person: Bob Johnson, Years: 40"]
        })

        result_df = final_table_space["source_data"].collect()
        # Ensure column order for comparison
        result_df = result_df.select(expected_df.columns)
        result_df = result_df.sort("id")
        expected_df = expected_df.sort("id")

        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_add_columns_with_fillna_expression(self):
        """
        Tests AddColumns step with a FillNaExpression.
        Fills null values in 'col_with_nulls' with values from 'fallback_col'.
        Also tests filling with a constant value.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "col_with_nulls": [10, None, 30, None],
            "fallback_col": [100, 200, 300, 400],
            "another_col": [1, 2, 3, 4]
        }).lazy()
        initial_table_space: TableSpace = {"source_data": initial_df}

        fillna_step = AddColumns(
            table="source_data",
            columns=[
                ColumnDefinition(
                    name="filled_with_col",
                    expression=FillNaExpression(
                        input=ColumnReferenceExpression(name="col_with_nulls"),
                        fill_value=ColumnReferenceExpression(name="fallback_col")
                    )
                ),
                ColumnDefinition(
                    name="filled_with_const",
                    expression=FillNaExpression(
                        input=ColumnReferenceExpression(name="col_with_nulls"),
                        fill_value=ConstantValueExpression(value=-1)
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[fillna_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "col_with_nulls": [10, None, 30, None],
            "fallback_col": [100, 200, 300, 400],
            "another_col": [1, 2, 3, 4],
            "filled_with_col": [10, 200, 30, 400],
            "filled_with_const": [10, -1, 30, -1]
        }, schema_overrides={
            "col_with_nulls": pl.Int64,
            "filled_with_col": pl.Int64,
            "filled_with_const": pl.Int64
        })

        result_df = final_table_space["source_data"].collect()
        # Ensure column order for comparison
        result_df = result_df.select(expected_df.columns)
        result_df = result_df.sort("id")
        expected_df = expected_df.sort("id")

        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_window_expression_aggregations(self):
        """
        Tests AddColumns step with WindowExpression for various aggregations.
        - sum('value') over ('category')
        - mean('value') over ('category')
        - count('id') over ()
        - min('value') over ('category')
        - first('value') over ('category') - input sorted for predictable first
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5, 6],
            "category": ["A", "A", "B", "A", "B", "B"],
            "value": [10, 20, 100, 30, 200, 300],
            "order_for_first": [1,2,1,3,2,3] # To make first() predictable within category
        }).lazy().sort(["category", "order_for_first"]) # Sort for predictable first()

        initial_table_space: TableSpace = {"data_table": initial_df}

        window_agg_step = AddColumns(
            table="data_table",
            columns=[
                ColumnDefinition(
                    name="sum_val_by_cat",
                    expression=WindowExpression(
                        aggregation='sum',
                        value=ColumnReferenceExpression(name="value"),
                        partition_by=[ColumnReferenceExpression(name="category")]
                    )
                ),
                ColumnDefinition(
                    name="mean_val_by_cat",
                    expression=WindowExpression(
                        aggregation='mean',
                        value=ColumnReferenceExpression(name="value"),
                        partition_by=[ColumnReferenceExpression(name="category")]
                    )
                ),
                ColumnDefinition(
                    name="total_count", # Count all IDs over the whole frame
                    expression=WindowExpression(
                        aggregation='count',
                        value=ColumnReferenceExpression(name="id"),
                        partition_by=[] # Empty partition_by for whole frame window
                    )
                ),
                 ColumnDefinition(
                    name="min_val_by_cat",
                    expression=WindowExpression(
                        aggregation='min',
                        value=ColumnReferenceExpression(name="value"),
                        partition_by=[ColumnReferenceExpression(name="category")]
                    )
                ),
                ColumnDefinition(
                    name="first_val_by_cat",
                    expression=WindowExpression(
                        aggregation='first',
                        value=ColumnReferenceExpression(name="value"),
                        partition_by=[ColumnReferenceExpression(name="category")]
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[window_agg_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        # Expected results are calculated based on the sorted initial_df
        # Category A: ids [1,2,4], values [10,20,30] -> sum=60, mean=20, min=10, first=10
        # Category B: ids [3,5,6], values [100,200,300] -> sum=600, mean=200, min=100, first=100
        # Total count: 6

        expected_df = pl.DataFrame({
            "id": [1, 2, 4, 3, 5, 6], # Based on initial sort
            "category": ["A", "A", "A", "B", "B", "B"],
            "value": [10, 20, 30, 100, 200, 300],
            "order_for_first": [1,2,3,1,2,3],
            "sum_val_by_cat": [60, 60, 60, 600, 600, 600],
            "mean_val_by_cat": [20.0, 20.0, 20.0, 200.0, 200.0, 200.0],
            "total_count": [6, 6, 6, 6, 6, 6],
            "min_val_by_cat": [10, 10, 10, 100, 100, 100],
            "first_val_by_cat": [10, 10, 10, 100, 100, 100],
        }, schema_overrides={"total_count": pl.UInt32, "min_val_by_cat": pl.Int64, "first_val_by_cat": pl.Int64})

        result_df = final_table_space["data_table"].collect()
        # Sort result by the same keys as expected_df if not already guaranteed by processing
        result_df = result_df.sort(["category", "order_for_first"]) 
        
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_add_columns_unary_minus(self):
        """
        Tests AddColumns step with a UnaryMinusExpression.
        Adds a column 'negated_value' = -col("value").
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3],
            "value": [10, -5, 0]
        }).lazy()
        initial_table_space: TableSpace = {"input_table": initial_df}

        add_col_step = AddColumns(
            table="input_table",
            columns=[
                ColumnDefinition(
                    name="negated_value",
                    expression=UnaryMinusExpression(
                        value=ColumnReferenceExpression(name="value")
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[add_col_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3],
            "value": [10, -5, 0],
            "negated_value": [-10, 5, 0]
        })

        result_df = final_table_space["input_table"].collect()
        # Ensure column order for comparison
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_string_contains_expression_literal(self):
        """
        Tests AddColumns step with StringContainsExpression using literal matching.
        Checks if strings contain the literal pattern.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "text": ["hello world", "HELLO world", "goodbye", "world hello"]
        }).lazy()
        initial_table_space: TableSpace = {"test_data": initial_df}

        contains_step = AddColumns(
            table="test_data",
            columns=[
                ColumnDefinition(
                    name="contains_hello_literal",
                    expression=StringContainsExpression(
                        value=ColumnReferenceExpression(name="text"),
                        pattern="hello",  # Using string directly instead of ConstantValueExpression
                        literal=True
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[contains_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "text": ["hello world", "HELLO world", "goodbye", "world hello"],
            "contains_hello_literal": [True, False, False, True]  # Case sensitive literal
        })

        result_df = final_table_space["test_data"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_string_contains_expression_regex(self):
        """
        Tests AddColumns step with StringContainsExpression using regex matching.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "text": ["hello123", "HELLO456", "goodbye", "test789"]
        }).lazy()
        initial_table_space: TableSpace = {"test_data": initial_df}

        contains_step = AddColumns(
            table="test_data",
            columns=[
                ColumnDefinition(
                    name="contains_hello_digits",
                    expression=StringContainsExpression(
                        value=ColumnReferenceExpression(name="text"),
                        pattern=ConstantValueExpression(value=r"(?i)hello\d+"),  # Case insensitive + digits
                        literal=False
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[contains_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "text": ["hello123", "HELLO456", "goodbye", "test789"],
            "contains_hello_digits": [True, True, False, False]
        })

        result_df = final_table_space["test_data"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_string_contains_any_expression(self):
        """
        Tests AddColumns step with StringContainsAnyExpression.
        Checks if strings contain any of the provided patterns.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "text": ["apple pie", "banana split", "orange juice", "grape soda", "watermelon"]
        }).lazy()
        initial_table_space: TableSpace = {"test_data": initial_df}

        contains_any_step = AddColumns(
            table="test_data",
            columns=[
                ColumnDefinition(
                    name="contains_citrus",
                    expression=StringContainsAnyExpression(
                        value=ColumnReferenceExpression(name="text"),
                        patterns=["orange", "lemon", "lime", "grapefruit"]
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[contains_any_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "text": ["apple pie", "banana split", "orange juice", "grape soda", "watermelon"],
            "contains_citrus": [False, False, True, False, False]  # Only "orange juice" matches
        })

        result_df = final_table_space["test_data"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_string_count_matches_expression(self):
        """
        Tests AddColumns step with StringCountMatchesExpression.
        Counts how many times a pattern occurs in each string.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "text": ["ababab", "abcabc", "xyz", "aaa"]
        }).lazy()
        initial_table_space: TableSpace = {"test_data": initial_df}

        count_matches_step = AddColumns(
            table="test_data",
            columns=[
                ColumnDefinition(
                    name="count_ab_literal",
                    expression=StringCountMatchesExpression(
                        value=ColumnReferenceExpression(name="text"),
                        pattern="ab",  # Using string directly
                        literal=True
                    )
                ),
                ColumnDefinition(
                    name="count_a_regex",
                    expression=StringCountMatchesExpression(
                        value=ColumnReferenceExpression(name="text"),
                        pattern=ConstantValueExpression(value="a+"),  # One or more 'a'
                        literal=False
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[count_matches_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "text": ["ababab", "abcabc", "xyz", "aaa"],
            "count_ab_literal": [3, 2, 0, 0],  # "ababab" has 3 overlapping "ab", "abcabc" has 2
            "count_a_regex": [3, 2, 0, 1]     # "ababab" has 3 'a', "abcabc" has 2, "aaa" has 1 match of "a+"
        }, schema_overrides={"count_ab_literal": pl.UInt32, "count_a_regex": pl.UInt32})

        result_df = final_table_space["test_data"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_string_extract_expression(self):
        """
        Tests AddColumns step with StringExtractExpression.
        Extracts parts of strings using regex patterns and capture groups.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "email": ["john.doe@example.com", "jane_smith@test.org", "invalid-email", "bob@company.co.uk"]
        }).lazy()
        initial_table_space: TableSpace = {"test_data": initial_df}

        extract_step = AddColumns(
            table="test_data",
            columns=[
                ColumnDefinition(
                    name="username",
                    expression=StringExtractExpression(
                        value=ColumnReferenceExpression(name="email"),
                        pattern=ConstantValueExpression(value=r"^([^@]+)@.*"),
                        group_index=1  # Extract the first capture group (username part)
                    )
                ),
                ColumnDefinition(
                    name="domain",
                    expression=StringExtractExpression(
                        value=ColumnReferenceExpression(name="email"),
                        pattern=ConstantValueExpression(value=r"^[^@]+@(.+)"),
                        group_index=1  # Extract the domain part
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[extract_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "email": ["john.doe@example.com", "jane_smith@test.org", "invalid-email", "bob@company.co.uk"],
            "username": ["john.doe", "jane_smith", None, "bob"],  # None for invalid email
            "domain": ["example.com", "test.org", None, "company.co.uk"]
        })

        result_df = final_table_space["test_data"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_string_starts_with_expression(self):
        """
        Tests AddColumns step with StringStartsWithExpression.
        Checks if strings start with specific prefixes.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "filename": ["document.pdf", "image.jpg", "data.csv", "Document.PDF", "script.py"]
        }).lazy()
        initial_table_space: TableSpace = {"test_data": initial_df}

        starts_with_step = AddColumns(
            table="test_data",
            columns=[
                ColumnDefinition(
                    name="starts_with_doc",
                    expression=StringStartsWithExpression(
                        value=ColumnReferenceExpression(name="filename"),
                        prefix="document"  # Using string directly
                    )
                ),
                ColumnDefinition(
                    name="starts_with_data",
                    expression=StringStartsWithExpression(
                        value=ColumnReferenceExpression(name="filename"),
                        prefix="data"  # Using string directly
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[starts_with_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "filename": ["document.pdf", "image.jpg", "data.csv", "Document.PDF", "script.py"],
            "starts_with_doc": [True, False, False, False, False],  # Case sensitive
            "starts_with_data": [False, False, True, False, False]
        })

        result_df = final_table_space["test_data"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_string_ends_with_expression(self):
        """
        Tests AddColumns step with StringEndsWithExpression.
        Checks if strings end with specific suffixes.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "filename": ["document.pdf", "image.jpg", "data.csv", "archive.ZIP", "readme.txt"]
        }).lazy()
        initial_table_space: TableSpace = {"test_data": initial_df}

        ends_with_step = AddColumns(
            table="test_data",
            columns=[
                ColumnDefinition(
                    name="is_pdf",
                    expression=StringEndsWithExpression(
                        value=ColumnReferenceExpression(name="filename"),
                        suffix=".pdf"  # Using string directly
                    )
                ),
                ColumnDefinition(
                    name="is_image",
                    expression=StringEndsWithExpression(
                        value=ColumnReferenceExpression(name="filename"),
                        suffix=".jpg"  # Using string directly
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[ends_with_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "filename": ["document.pdf", "image.jpg", "data.csv", "archive.ZIP", "readme.txt"],
            "is_pdf": [True, False, False, False, False],  # Case sensitive
            "is_image": [False, True, False, False, False]
        })

        result_df = final_table_space["test_data"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)

    def test_string_contains_any_case_insensitive(self):
        """
        Tests StringContainsAnyExpression with ascii_case_insensitive=True.
        """
        initial_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "text": ["Apple", "BANANA", "orange", "GRAPE"]
        }).lazy()
        initial_table_space: TableSpace = {"test_data": initial_df}

        contains_any_step = AddColumns(
            table="test_data",
            columns=[
                ColumnDefinition(
                    name="contains_fruit_ci",
                    expression=StringContainsAnyExpression(
                        value=ColumnReferenceExpression(name="text"),
                        patterns=["apple", "banana"],
                        ascii_case_insensitive=True
                    )
                )
            ]
        )

        workflow = PWorkflow(workflow=[contains_any_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_table_space
        )

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "text": ["Apple", "BANANA", "orange", "GRAPE"],
            "contains_fruit_ci": [True, True, False, False]  # Case insensitive matching
        })

        result_df = final_table_space["test_data"].collect()
        result_df = result_df.select(expected_df.columns)
        assert_frame_equal(result_df, expected_df, check_dtypes=True)


if __name__ == '__main__':
    unittest.main()
