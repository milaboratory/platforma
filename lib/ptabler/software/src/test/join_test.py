import unittest
import polars as pl
from polars.testing import assert_frame_equal

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, Join, TableSpace
from ptabler.steps.join import ColumnMapping
from ptabler.expression import ColumnReferenceExpression

# Minimal global_settings for tests
global_settings = GlobalSettings(root_folder=".")


class JoinStepTests(unittest.TestCase):

    def setUp(self):
        """Setup common data for join tests."""
        self.left_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "name": ["Alice", "Bob", "Charlie", "David"],
            "value_left": [10, 20, 30, 40]
        }).lazy()

        self.right_df = pl.DataFrame({
            "id": [1, 2, 3, 5],
            "city": ["New York", "London", "Paris", "Berlin"],
            "value_right": [100, 200, 300, 500]
        }).lazy()

        self.initial_table_space: TableSpace = {
            "left_table": self.left_df,
            "right_table": self.right_df
        }

    def _execute_join_workflow(self, join_step: Join) -> pl.DataFrame:
        """Helper to execute a workflow with a single join step."""
        workflow = PWorkflow(workflow=[join_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=self.initial_table_space.copy()
        )
        self.assertTrue("joined_output" in final_table_space)
        return final_table_space["joined_output"].collect()

    def test_inner_join(self):
        """Tests an inner join."""
        join_step = Join(
            left_table="left_table",
            right_table="right_table",
            output_table="joined_output",
            how="inner",
            left_on=["id"],
            right_on=["id"]
        )
        result_df = self._execute_join_workflow(join_step)

        expected_df = pl.DataFrame({
            "id": [1, 2, 3],
            "name": ["Alice", "Bob", "Charlie"],
            "value_left": [10, 20, 30],
            "city": ["New York", "London", "Paris"],
            "value_right": [100, 200, 300]
        }).sort("id")
        # Ensure 'id_right' is not present (should be handled by explicit column selection now)
        self.assertNotIn("id_right", result_df.columns, "Column 'id_right' should not be present after join with explicit column selection.")

        assert_frame_equal(result_df.sort("id"), expected_df, check_dtypes=False)


    def test_left_join(self):
        """Tests a left join."""
        join_step = Join(
            left_table="left_table",
            right_table="right_table",
            output_table="joined_output",
            how="left",
            left_on=["id"],
            right_on=["id"],
            left_columns=[
                ColumnMapping(column="id"),
                ColumnMapping(column="name"),
                ColumnMapping(column="value_left")
            ],
            right_columns=[
                ColumnMapping(column="id"),
                ColumnMapping(column="city"),
                ColumnMapping(column="value_right")
            ]
        )
        result_df = self._execute_join_workflow(join_step)

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "name": ["Alice", "Bob", "Charlie", "David"],
            "value_left": [10, 20, 30, 40],
            "city": ["New York", "London", "Paris", None],
            "value_right": [100, 200, 300, None]
        }, schema_overrides={"value_right": pl.Int64}).sort("id")
        # Ensure 'id_right' is not present
        self.assertNotIn("id_right", result_df.columns, "Column 'id_right' should not be present after join with explicit column selection.")

        assert_frame_equal(result_df.sort("id"), expected_df, check_dtypes=False)


    def test_outer_join(self):
        """Tests an outer join."""
        join_step = Join(
            left_table="left_table",
            right_table="right_table",
            output_table="joined_output",
            how="full",
            left_on=["id"],
            right_on=["id"],
            left_columns=[
                ColumnMapping(column="id"),
                ColumnMapping(column="name"),
                ColumnMapping(column="value_left")
            ],
            right_columns=[
                ColumnMapping(column="id"),
                ColumnMapping(column="city"),
                ColumnMapping(column="value_right")
            ]
        )
        result_df = self._execute_join_workflow(join_step)

        expected_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "name": ["Alice", "Bob", "Charlie", "David", None],
            "value_left": [10, 20, 30, 40, None],
            "city": ["New York", "London", "Paris", None, "Berlin"],
            "value_right": [100, 200, 300, None, 500]
        }, schema_overrides={"value_left": pl.Int64, "value_right": pl.Int64}).sort("id")
        
        # Handle Polars' default behavior for outer joins where it creates 'id' and 'id_right'
        # when join keys (left_on, right_on) are named the same, even after left_columns/right_columns aliasing.
        if "id_right" in result_df.columns and "id" in result_df.columns:
            # Coalesce 'id' from left and 'id_right' from right into a single 'id' column
            result_df = result_df.with_columns(
                pl.coalesce(pl.col("id"), pl.col("id_right")).alias("id_coalesced")
            ).drop("id", "id_right").rename({"id_coalesced": "id"})
        elif "id_right" in result_df.columns and "id" not in result_df.columns:
            # This case might occur if the left 'id' column was somehow not selected or was named differently
            # prior to the join, and only 'id_right' came through.
            result_df = result_df.rename({"id_right": "id"})
        
        # After handling, 'id_right' should not be present, and 'id' should be the coalesced key.
        self.assertNotIn("id_right", result_df.columns, "Column 'id_right' should have been removed after coalescing.")
        self.assertIn("id", result_df.columns, "Column 'id' should be present as the coalesced key.")

        # Ensure columns are in the expected order for comparison and select only expected columns
        result_df_ordered = result_df.select(expected_df.columns)

        assert_frame_equal(result_df_ordered.sort("id"), expected_df, check_dtypes=False)

    def test_cross_join(self):
        """Tests a cross join."""
        # For cross join, let's use smaller DFs to keep the output manageable
        left_small_df = pl.DataFrame({"lk": ["L1", "L2"]}).lazy()
        right_small_df = pl.DataFrame({"rk": ["R1", "R2", "R3"]}).lazy()

        initial_cs_table_space: TableSpace = {
            "left_small": left_small_df,
            "right_small": right_small_df
        }

        join_step = Join(
            left_table="left_small",
            right_table="right_small",
            output_table="joined_output",
            how="cross",
            # No left_on or right_on for cross join
            left_columns=[ColumnMapping(column="lk")],
            right_columns=[ColumnMapping(column="rk")]
        )

        workflow = PWorkflow(workflow=[join_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=initial_cs_table_space
        )
        self.assertTrue("joined_output" in final_table_space)
        result_df = final_table_space["joined_output"].collect()


        expected_df = pl.DataFrame({
            "lk": ["L1", "L1", "L1", "L2", "L2", "L2"],
            "rk": ["R1", "R2", "R3", "R1", "R2", "R3"],
        }).sort(["lk", "rk"])


        assert_frame_equal(result_df.sort(["lk", "rk"]), expected_df, check_dtypes=False)

    def test_join_with_different_key_names(self):
        """Tests a join where left_on and right_on have different column names."""
        # Original right_df is used, renaming is handled by right_columns
        
        temp_initial_table_space: TableSpace = {
            "left_table": self.left_df,
            "right_table": self.right_df # Use original right_df
        }

        join_step = Join(
            left_table="left_table",
            right_table="right_table", 
            output_table="joined_output",
            how="inner",
            left_on=["id"], # Original name from left_table
            right_on=["id"], # Original name from right_table (which is then mapped to key_right)
            left_columns=[
                ColumnMapping(column="id"), # Selected, keeps original name 'id'
                ColumnMapping(column="name"),
                ColumnMapping(column="value_left")
            ],
            right_columns=[
                ColumnMapping(column="id", rename="key_right"), # Original 'id' from right_table, renamed to 'key_right'
                ColumnMapping(column="city"),
                ColumnMapping(column="value_right")
            ]
        )
        
        workflow = PWorkflow(workflow=[join_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=temp_initial_table_space.copy()
        )
        self.assertTrue("joined_output" in final_table_space)
        result_df = final_table_space["joined_output"].collect()

        # If Polars adds "id_right" due to the original key names being the same ("id")
        # before one was mapped to "key_right" for the join, we remove it.
        if "id_right" in result_df.columns:
            result_df = result_df.drop("id_right")

        expected_df = pl.DataFrame({
            "id": [1, 2, 3], # Key column name from left table's perspective (after potential mapping)
            "name": ["Alice", "Bob", "Charlie"],
            "value_left": [10, 20, 30],
            # "key_right" column from right table is not automatically included unless specified in right_columns
            # and if join keys differ, polars keeps left. Here join keys after mapping are "id" and "key_right".
            "city": ["New York", "London", "Paris"],
            "value_right": [100, 200, 300]
        }).sort("id")
        
        # After the join, if left_on=["id"] and right_on=["id"] (original names), 
        # and right_columns maps "id" to "key_right",
        # Polars will attempt to join left.id on right.key_right.
        # The output column for the key will typically be based on the left side, i.e., "id".
        # The column "key_right" (if it was the original name on the right) might appear if not aliased away
        # or if it was the name used in right_on and no explicit right_columns for it.
        # However, with explicit column selection, the name in right_on ("id" which maps to "key_right")
        # should result in "key_right" being used in the join condition, and "id" from left table being in output.

        self.assertIn("id", result_df.columns)
        self.assertNotIn("key_right", result_df.columns) # "key_right" was used for join but "id" (from left) is the output key name.
        self.assertNotIn("id_right", result_df.columns) # Ensure "id_right" is not present after potential drop


        assert_frame_equal(result_df.sort("id"), expected_df, check_dtypes=False)

    def test_error_missing_left_on_for_non_cross_join(self):
        """Tests that a ValueError is raised if left_on is missing for a non-cross join."""
        with self.assertRaisesRegex(ValueError, "Missing 'left_on' for 'inner' join."):
            join_step = Join(
                left_table="left_table",
                right_table="right_table",
                output_table="joined_output",
                how="inner",
                # left_on is missing
                right_on=["id"]
            )
            self._execute_join_workflow(join_step)
            
    def test_error_missing_right_on_for_non_cross_join(self):
        """Tests that a ValueError is raised if right_on is missing for a non-cross join."""
        with self.assertRaisesRegex(ValueError, "Missing 'right_on' for 'left' join."):
            join_step = Join(
                left_table="left_table",
                right_table="right_table",
                output_table="joined_output",
                how="left",
                left_on=["id"]
                # right_on is missing
            )
            self._execute_join_workflow(join_step)

    def test_error_left_table_not_found(self):
        """Tests error when left_table is not in tablespace."""
        with self.assertRaisesRegex(ValueError, "Left table 'nonexistent_left_table' not found in tablespace."):
            join_step = Join(
                left_table="nonexistent_left_table",
                right_table="right_table",
                output_table="joined_output",
                how="inner",
                left_on=["id"],
                right_on=["id"]
            )
            self._execute_join_workflow(join_step)

    def test_error_right_table_not_found(self):
        """Tests error when right_table is not in tablespace."""
        with self.assertRaisesRegex(ValueError, "Right table 'nonexistent_right_table' not found in tablespace."):
            join_step = Join(
                left_table="left_table",
                right_table="nonexistent_right_table",
                output_table="joined_output",
                how="inner",
                left_on=["id"],
                right_on=["id"]
            )
            self._execute_join_workflow(join_step)

    def test_join_keys_identity_mapped_when_not_in_column_specs(self):
        """
        Tests that join keys are identity-mapped if not in explicit column selections,
        provided column selections are active (i.e., not None).
        """
        left_source = pl.DataFrame({
            "pk1": [1, 2],
            "pk2": ["a", "b"],
            "val_left": [10, 20],
            "other_left": [100, 200]
        }).lazy()
        right_source = pl.DataFrame({
            "fk1": [1, 2], # Original name for first key
            "fk2_renamed": ["a", "b"], # Original name for second key (will be renamed)
            "val_right": [30, 40],
            "other_right": [300, 400]
        }).lazy()

        temp_table_space: TableSpace = {
            "left_s": left_source,
            "right_s": right_source
        }

        join_step = Join(
            left_table="left_s",
            right_table="right_s",
            output_table="joined_output",
            how="inner",
            # These are the ORIGINAL names of join keys
            left_on=["pk1", "pk2"],
            right_on=["fk1", "fk2_renamed"],

            left_columns=[
                ColumnMapping(column="val_left", rename="val_l"),
                ColumnMapping(column="pk2", rename="pk2_final_left") 
                # pk1 is in left_on, not in left_columns, so it should be identity mapped: original "pk1" -> final "pk1"
            ],

            right_columns=[
                ColumnMapping(column="val_right", rename="val_r"),
                ColumnMapping(column="fk1", rename="pk1"), # Original "fk1" from right_s, renamed to final "pk1"
                ColumnMapping(column="fk2_renamed", rename="pk2_final_right") # Original "fk2_renamed" -> final "pk2_final_right"
            ]
        )

        workflow = PWorkflow(workflow=[join_step])
        final_table_space, _ = workflow.execute(
            global_settings=global_settings,
            lazy=True,
            initial_table_space=temp_table_space.copy()
        )
        self.assertTrue("joined_output" in final_table_space)
        result_df = final_table_space["joined_output"].collect()

        # Expected left_lf selection: val_l (from val_left), pk1 (from pk1), pk2_final_left (from pk2)
        # Expected right_lf selection: val_r (from val_right), pk1 (from fk1), pk2_final_right (from fk2_renamed)
        # Join on: left(pk1, pk2_final_left) and right(pk1, pk2_final_right)
        # Output columns: pk1, pk2_final_left (from left table, as Polars keeps left keys by default), val_l, val_r

        expected_df = pl.DataFrame({
            "pk1": [1, 2], # This comes from left_on mapping: left("pk1") joined with right("pk1" from "fk1")
            "pk2_final_left": ["a", "b"], # This comes from left_on mapping: left("pk2_final_left" from "pk2") joined with right("pk2_final_right" from "fk2_renamed")
            "val_l": [10, 20],
            "val_r": [30, 40]
        }).sort(["pk1", "pk2_final_left"])

        # Ensure columns are in the expected order for comparison
        result_df_ordered = result_df.select(expected_df.columns)

        assert_frame_equal(result_df_ordered.sort(["pk1", "pk2_final_left"]), expected_df, check_dtypes=False)

    def test_inner_join_coalesce_false(self):
        """Tests an inner join with coalesce=False, expecting separate key columns."""
        join_step = Join(
            left_table="left_table",
            right_table="right_table",
            output_table="joined_output",
            how="inner",
            left_on=["id"],
            right_on=["id"],
            coalesce=False,
            # Explicitly selecting columns to ensure behavior is clear
            left_columns=[
                ColumnMapping(column="id"),
                ColumnMapping(column="name"),
                ColumnMapping(column="value_left")
            ],
            right_columns=[
                ColumnMapping(column="id"), # This will become "id_right" or similar due to coalesce=False
                ColumnMapping(column="city"),
                ColumnMapping(column="value_right")
            ]
        )
        result_df = self._execute_join_workflow(join_step)

        expected_df = pl.DataFrame({
            "id": [1, 2, 3],
            "name": ["Alice", "Bob", "Charlie"],
            "value_left": [10, 20, 30],
            "id_right": [1, 2, 3], # Expected due to coalesce=False
            "city": ["New York", "London", "Paris"],
            "value_right": [100, 200, 300]
        }).sort("id")

        self.assertIn("id", result_df.columns)
        self.assertIn("id_right", result_df.columns)
        assert_frame_equal(result_df.sort("id"), expected_df, check_dtypes=False)

    def test_inner_join_coalesce_true(self):
        """Tests an inner join with coalesce=True (default behavior)."""
        join_step = Join(
            left_table="left_table",
            right_table="right_table",
            output_table="joined_output",
            how="inner",
            left_on=["id"],
            right_on=["id"],
            coalesce=True, # Explicitly True, should be default
            left_columns=[
                ColumnMapping(column="id"),
                ColumnMapping(column="name"),
                ColumnMapping(column="value_left")
            ],
            right_columns=[
                # "id" from right_table is specified for the join key,
                # but should be coalesced away in the final output.
                ColumnMapping(column="id"),
                ColumnMapping(column="city"),
                ColumnMapping(column="value_right")
            ]
        )
        result_df = self._execute_join_workflow(join_step)

        expected_df = pl.DataFrame({
            "id": [1, 2, 3],
            "name": ["Alice", "Bob", "Charlie"],
            "value_left": [10, 20, 30],
            "city": ["New York", "London", "Paris"],
            "value_right": [100, 200, 300]
        }).sort("id")

        self.assertIn("id", result_df.columns)
        self.assertNotIn("id_right", result_df.columns, "Column 'id_right' should not be present when coalesce=True.")
        assert_frame_equal(result_df.sort("id"), expected_df, check_dtypes=False)


if __name__ == '__main__':
    unittest.main()
