"""Python-side tests for `WriteFrame`.

Most behavioural coverage (per-partition writes, hashing, `.datainfo`
shape, strict-mode null checks, adjacent-duplicate detection) lives in
the Rust crate `pframes_rs_exec` under
`packages/exec/tests/convert.rs`. The Python tests here only cover:

  * Python-side spec validation in `WriteFrame.execute()` (no Rust call).
  * One happy-path round-trip that confirms the wheel binding actually
    runs and produces a `.datainfo` + `partition_*.parquet` of the right
    shape (parsed via msgspec, content checked with polars).
  * A couple of structural sanity tests for the polars + duckdb parquet
    stack we depend on.
"""

import os
import shutil
import unittest

import duckdb
import msgspec.json
import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq
from polars.testing import assert_frame_equal

from ptabler.steps import GlobalSettings
from ptabler.steps.util import normalize_path
from ptabler.steps.write_frame import (
    AxisMapping,
    ColumnMapping,
    DataInfo,
    WriteFrame,
)
from ptabler.workflow.workflow import PWorkflow

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data",
)
global_settings = GlobalSettings(root_folder=test_data_root_dir)


class StructuralSanityTests(unittest.TestCase):
    """Sanity checks on the underlying polars+pyarrow+duckdb stack. None of
    these exercise WriteFrame itself — they exist to catch silent breakage
    in the third-party libraries WriteFrame depends on.
    """

    maxDiff = None

    def test_empty_parquet_write_and_read(self):
        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", "empty.parquet")
        empty_lazy_df = pl.LazyFrame(schema={"axis": pl.String, "column": pl.Int64})
        empty_lazy_df.sink_parquet(output_file_abs_path)
        try:
            self.assertTrue(os.path.exists(output_file_abs_path))
            output_df = pl.read_parquet(output_file_abs_path)
            self.assertEqual(len(output_df), 0)
            self.assertEqual(list(output_df.columns), ["axis", "column"])
        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_duckdb_read_parquet_metadata(self):
        output_file_abs_path = os.path.join(
            test_data_root_dir, "outputs", "metadata_test.parquet"
        )
        conn = duckdb.connect()
        try:
            conn.execute(f"""
                COPY (
                    SELECT i AS int_column, i * 1.5 AS float_column
                    FROM range(1, 101) t(i)
                )
                TO '{output_file_abs_path}'
                (FORMAT PARQUET, COMPRESSION 'ZSTD', COMPRESSION_LEVEL 3)
            """)
            self.assertTrue(os.path.exists(output_file_abs_path))
            (rows,) = conn.execute(
                f"SELECT num_rows FROM parquet_file_metadata('{output_file_abs_path}')"
            ).fetchone()
            self.assertEqual(rows, 100)
        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_polars_string_axis_emits_large_string(self):
        """Polars defaults strings to LargeUtf8 (`pa.large_string()`) when
        sinking parquet. WriteFrame relies on the Rust `convert` impl to
        downcast these to `pa.string()` in its output; this test only
        documents the polars default.
        """
        output_file_abs_path = os.path.join(
            test_data_root_dir, "outputs", "polars_default_string.parquet"
        )
        try:
            pl.DataFrame({"s": ["test_value"], "n": [42.5]}).write_parquet(
                output_file_abs_path
            )
            self.assertEqual(
                pq.read_schema(output_file_abs_path).field("s").type,
                pa.large_string(),
            )
        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)


class WriteFrameInputValidationTests(unittest.TestCase):
    """Validation that happens entirely in Python (`WriteFrame._validate`)
    before any Rust call. These never touch the file system.
    """

    def test_empty_frame_name(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="t",
                frame_name="",
                axes=[AxisMapping(column="id", type="Long")],
                columns=[ColumnMapping(column="value", type="Double")],
            ).execute(None)
        self.assertIn("frame_name", str(cm.exception).lower())

    def test_frame_name_with_path(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="t",
                frame_name="path/to/frame",
                axes=[AxisMapping(column="id", type="Long")],
                columns=[ColumnMapping(column="value", type="Double")],
            ).execute(None)
        self.assertIn("directory name, not a path", str(cm.exception))

    def test_no_axes(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="t",
                frame_name="frame",
                axes=[],
                columns=[ColumnMapping(column="value", type="Double")],
            ).execute(None)
        self.assertIn("axis must be specified", str(cm.exception).lower())

    def test_no_columns(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="t",
                frame_name="frame",
                axes=[AxisMapping(column="id", type="Long")],
                columns=[],
            ).execute(None)
        self.assertIn("column must be specified", str(cm.exception).lower())

    def test_duplicate_column_names_axes_and_columns(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="t",
                frame_name="frame",
                axes=[AxisMapping(column="duplicate", type="Long")],
                columns=[ColumnMapping(column="duplicate", type="Double")],
            ).execute(None)
        self.assertIn("duplicate", str(cm.exception))

    def test_multiple_duplicate_column_names(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="t",
                frame_name="frame",
                axes=[
                    AxisMapping(column="dup1", type="Long"),
                    AxisMapping(column="dup2", type="String"),
                ],
                columns=[
                    ColumnMapping(column="dup1", type="Double"),
                    ColumnMapping(column="dup2", type="Float"),
                ],
            ).execute(None)
        msg = str(cm.exception)
        self.assertIn("dup1", msg)
        self.assertIn("dup2", msg)

    def test_partition_key_length_equals_axes_count(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="t",
                frame_name="frame",
                axes=[
                    AxisMapping(column="id", type="Long"),
                    AxisMapping(column="name", type="String"),
                ],
                columns=[ColumnMapping(column="value", type="Double")],
                partition_key_length=2,
            ).execute(None)
        self.assertIn("partition_key_length", str(cm.exception))
        self.assertIn("strictly less than", str(cm.exception))


class WriteFrameHappyPathTest(unittest.TestCase):
    """One end-to-end test that runs the wheel binding and verifies the
    output PFrame's *shape* (file presence, parquet content, DataInfo
    structure) without hardcoding the v02 digest — the digest is owned by
    the Rust side and is exercised in detail by `convert.rs` rstests.
    """

    def test_write_not_partitioned_frame(self):
        frame_name = "happy_path_frame"
        frame_dir = os.path.join(global_settings.root_folder, normalize_path(frame_name))
        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        step = WriteFrame(
            input_table="input_table",
            frame_name=frame_name,
            axes=[
                AxisMapping(column="id", type="Long"),
                AxisMapping(column="name", type="String"),
            ],
            columns=[ColumnMapping(column="value", type="Double")],
            partition_key_length=0,
        )
        ptw = PWorkflow(workflow=[step])
        lf = pl.LazyFrame({
            "id": [1, 2, 3],
            "name": ["Alice", "Bob", "Charlie"],
            "value": [10.5, 20.0, 30.5],
        })

        try:
            ptw.execute(
                global_settings=global_settings,
                initial_table_space={"input_table": lf},
            )

            # 1) Output files exist.
            datainfo_file = os.path.join(frame_dir, "value.datainfo")
            partition_file = os.path.join(frame_dir, "partition_0.parquet")
            self.assertTrue(os.path.exists(datainfo_file))
            self.assertTrue(os.path.exists(partition_file))
            # 2) Intermediate parquet is cleaned up.
            self.assertFalse(
                os.path.exists(os.path.join(frame_dir, "intermediate.parquet"))
            )

            # 3) Parquet content matches what we sent in, sorted by axes,
            #    with string columns downcast from LargeUtf8 to Utf8.
            actual_df = pl.read_parquet(partition_file).sort("id")
            expected_df = pl.DataFrame({
                "id": [1, 2, 3],
                "name": ["Alice", "Bob", "Charlie"],
                "value": [10.5, 20.0, 30.5],
            })
            assert_frame_equal(actual_df, expected_df, check_dtypes=False)
            self.assertEqual(
                pq.read_schema(partition_file).types,
                [pa.int64(), pa.string(), pa.float64()],
            )

            # 4) DataInfo envelope decodes cleanly and matches the canonical
            #    output of `pframes_rs_exec::convert`. The exact `data_digest`
            #    value is verified byte-for-byte in BOTH the Rust convert
            #    rstests (`packages/exec/tests/test_data/convert/not_partitioned/
            #    expected/value.datainfo`) AND here — any drift on either side
            #    fails one of the two tests.
            with open(datainfo_file, "rb") as f:
                info = msgspec.json.decode(f.read(), type=DataInfo)
            self.assertEqual(info.partition_key_length, 0)
            self.assertEqual(info.type_spec.axes, ["Long", "String"])
            self.assertEqual(info.type_spec.column, "Double")
            self.assertEqual(set(info.parts.keys()), {"[]"})
            part = info.parts["[]"]
            self.assertEqual(part.data, "partition_0.parquet")
            self.assertEqual(
                [(a.id, a.type) for a in part.axes],
                [("id", "Long"), ("name", "String")],
            )
            self.assertEqual((part.column.id, part.column.type), ("value", "Double"))
            self.assertEqual(
                part.data_digest,
                "v02-4b9de7e76a9e3b428e63e46574ef1699eaea9456c4e997d550ab368c49d5aea0",
            )
            self.assertIsNotNone(part.stats)
            self.assertEqual(part.stats.number_of_rows, 3)
            self.assertIsNotNone(part.stats.number_of_bytes)
            # 3 i64 axes → 24, "Alice"+"Bob"+"Charlie" → 15, 3 f64 → 24.
            self.assertEqual(part.stats.number_of_bytes.axes, [24, 15])
            self.assertEqual(part.stats.number_of_bytes.column, 24)
        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)


if __name__ == "__main__":
    unittest.main()
