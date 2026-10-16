"""Tests for `ImportParquetFrame`.

The step exists because the Polars chain it replaces cannot read a Parquet file of
more than 2^32 rows (MILAB-7195). Its contract is that it is a drop-in for that
chain, so the central test here imports the same data both ways and asserts the two
PFrames are identical, down to the content-addressed digest.

The scale behaviour that motivated the step (4.3e9 rows, the sort skipped when the
input is already ordered) cannot run in a unit test, so what is covered here is the
logic that decides: the generated SQL, the order check, and the row-group sizing.
"""

import os
import shutil
import unittest

import duckdb
import msgspec.json
import polars as pl
import pyarrow as pa
import pyarrow.parquet as pq

from ptabler.steps import GlobalSettings
from ptabler.steps.import_parquet_frame import (
    ImportAxisMapping,
    ImportColumnMapping,
    ImportParquetFrame,
    build_import_query,
    build_order_check_query,
    to_duckdb_type,
)
from ptabler.steps.util import normalize_path
from ptabler.steps.write_frame import (
    MAX_ROW_GROUPS,
    ROW_GROUP_SIZE,
    AxisMapping,
    ColumnMapping,
    DataInfo,
    WriteFrame,
    row_group_size_for,
)
from ptabler.workflow.workflow import PWorkflow

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data",
)
global_settings = GlobalSettings(root_folder=test_data_root_dir)

KEY = "pl7.app/vdj/clonotypeKey"


def _long_format_table(n_entities: int = 4, dim: int = 3) -> pa.Table:
    """A long-format embedding block: one row per (key, dim), as the embeddings
    software writes it. Emitted in descending key order so nothing passes by luck,
    with a null key and a null value that both engines must drop."""
    keys, dims, vals = [], [], []
    for e in reversed(range(n_entities)):
        for d in reversed(range(dim)):
            keys.append(f"clone{e:03d}")
            dims.append(d)
            vals.append(round(e + d / 10, 3))
    return pa.table({
        KEY: pa.array(keys + [None, "cloneXXX"], pa.large_string()),
        "embedding_dim": pa.array(dims + [0, 1], pa.int64()),
        "value": pa.array(vals + [7.0, None], pa.float32()),
    })


def _import_step(frame_name: str, file: str = "import_source.parquet") -> ImportParquetFrame:
    return ImportParquetFrame(
        file=file,
        frame_name=frame_name,
        axes=[
            ImportAxisMapping(column="col1", type="String", source=KEY),
            ImportAxisMapping(column="col2", type="Int", source="embedding_dim"),
        ],
        columns=[
            ImportColumnMapping(column="col3", type="Float", source="value", not_null=True)
        ],
        partition_key_length=0,
        strict=False,
    )


class RowGroupSizingTests(unittest.TestCase):
    """Parquet caps a file at 32767 row groups (the ordinal is an i16), so a frame
    larger than MAX_ROW_GROUPS * ROW_GROUP_SIZE rows needs bigger groups."""

    def test_default_is_kept_for_ordinary_frames(self):
        for rows in (None, 0, 1, 1_000_000, ROW_GROUP_SIZE * MAX_ROW_GROUPS):
            self.assertEqual(row_group_size_for(rows), ROW_GROUP_SIZE, f"rows={rows}")

    def test_large_frames_stay_under_the_row_group_limit(self):
        for rows in (ROW_GROUP_SIZE * MAX_ROW_GROUPS + 1, 4_300_000_000, 30_488_710_656):
            size = row_group_size_for(rows)
            groups = -(-rows // size)
            self.assertGreater(size, ROW_GROUP_SIZE, f"rows={rows}")
            self.assertLessEqual(groups, 32_767, f"rows={rows} produced {groups} groups")


class QueryBuildingTests(unittest.TestCase):
    maxDiff = None

    def test_unknown_type_is_rejected(self):
        with self.assertRaises(ValueError):
            to_duckdb_type("Nonsense")

    def test_type_aliases_match_the_polars_mapping(self):
        # Same aliases STRING_TO_POLARS_TYPE uses, so a spec casts the same either way.
        self.assertEqual(to_duckdb_type("Int"), "INTEGER")
        self.assertEqual(to_duckdb_type("Long"), "BIGINT")
        self.assertEqual(to_duckdb_type("Float"), "FLOAT")
        self.assertEqual(to_duckdb_type("Double"), "DOUBLE")
        self.assertEqual(to_duckdb_type("String"), "VARCHAR")

    def test_sorted_input_drops_the_order_by(self):
        step = _import_step("unused")
        sql = build_import_query(step, "/in.parquet", "/out.parquet", already_sorted=True)
        self.assertNotIn("ORDER BY", sql)
        # PRESERVE_ORDER is what carries the source order through instead.
        self.assertIn("PRESERVE_ORDER TRUE", sql)

    def test_unsorted_input_sorts_by_every_axis_in_order(self):
        sql = build_import_query(_import_step("unused"), "/in.parquet", "/out.parquet")
        self.assertIn('ORDER BY "col1" ASC NULLS FIRST, "col2" ASC NULLS FIRST', sql)

    def test_identifiers_and_paths_are_escaped(self):
        step = ImportParquetFrame(
            file="x", frame_name="f",
            axes=[ImportAxisMapping(column='we"ird', type="String", source='sr"c')],
            columns=[ImportColumnMapping(column="v", type="Float")],
        )
        sql = build_import_query(step, "/tmp/it's.parquet", "/tmp/o.parquet")
        self.assertIn('"we""ird"', sql)
        self.assertIn('"sr""c"', sql)
        self.assertIn("'/tmp/it''s.parquet'", sql)


class ValidationTests(unittest.TestCase):
    def test_partition_key_length_must_be_less_than_axis_count(self):
        for bad in (-1, 2, 3):
            step = _import_step("unused")
            step.partition_key_length = bad
            with self.assertRaises(ValueError, msg=f"partition_key_length={bad}"):
                step._validate()

    def test_duplicate_output_names_are_rejected(self):
        step = ImportParquetFrame(
            file="x", frame_name="f",
            axes=[ImportAxisMapping(column="dup", type="String")],
            columns=[ImportColumnMapping(column="dup", type="Float")],
        )
        with self.assertRaises(ValueError):
            step._validate()

    def test_frame_name_must_not_be_a_path(self):
        step = _import_step("nested/name")
        with self.assertRaises(ValueError):
            step._validate()


class OrderCheckTests(unittest.TestCase):
    """The check decides whether the sort can be skipped, so a false 'sorted' would
    silently produce an unsorted PFrame. It must only pass on genuinely ordered input."""

    def _count_out_of_order(self, table: pa.Table) -> int:
        path = os.path.join(test_data_root_dir, "outputs", "order_check.parquet")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        pq.write_table(table, path)
        try:
            sql = build_order_check_query(_import_step("unused"), path)
            return duckdb.connect().execute(sql).fetchone()[0]
        finally:
            if os.path.exists(path):
                os.remove(path)

    def test_sorted_input_reports_no_violations(self):
        t = pa.table({
            KEY: pa.array(["a", "a", "b", "b"], pa.large_string()),
            "embedding_dim": pa.array([0, 1, 0, 1], pa.int64()),
            "value": pa.array([1.0, 2.0, 3.0, 4.0], pa.float32()),
        })
        self.assertEqual(self._count_out_of_order(t), 0)

    def test_descending_first_axis_is_caught(self):
        t = pa.table({
            KEY: pa.array(["b", "a"], pa.large_string()),
            "embedding_dim": pa.array([0, 0], pa.int64()),
            "value": pa.array([1.0, 2.0], pa.float32()),
        })
        self.assertEqual(self._count_out_of_order(t), 1)

    def test_second_axis_out_of_order_within_a_key_is_caught(self):
        # The first axis is non-decreasing, so only a lexicographic check catches this.
        t = pa.table({
            KEY: pa.array(["a", "a"], pa.large_string()),
            "embedding_dim": pa.array([1, 0], pa.int64()),
            "value": pa.array([1.0, 2.0], pa.float32()),
        })
        self.assertEqual(self._count_out_of_order(t), 1)


class EngineEquivalenceTests(unittest.TestCase):
    """The step is only safe to switch on if it is a drop-in for the Polars chain."""

    maxDiff = None

    def _describe(self, frame_dir: str) -> dict:
        datainfo = next(f for f in os.listdir(frame_dir) if f.endswith(".datainfo"))
        with open(os.path.join(frame_dir, datainfo), "rb") as f:
            info = msgspec.json.decode(f.read(), type=DataInfo)
        part = os.path.join(frame_dir, "partition_0.parquet")
        return {
            "datainfo": msgspec.json.encode(info),
            "rows": pl.read_parquet(part).to_dicts(),
            "schema": {f.name: str(f.type) for f in pq.read_schema(part)},
        }

    def test_matches_the_polars_chain_byte_for_byte(self):
        source = os.path.join(test_data_root_dir, "import_source.parquet")
        pq.write_table(_long_format_table(), source)

        duckdb_dir = os.path.join(global_settings.root_folder, normalize_path("equiv_duckdb"))
        polars_dir = os.path.join(global_settings.root_folder, normalize_path("equiv_polars"))
        for d in (duckdb_dir, polars_dir):
            shutil.rmtree(d, ignore_errors=True)

        try:
            PWorkflow(workflow=[_import_step("equiv_duckdb")]).execute(
                global_settings=global_settings
            )

            # The Polars path the SDK emits today: cast, drop null values, write_frame.
            lf = (
                pl.scan_parquet(source)
                .select(
                    pl.col(KEY).cast(pl.String, strict=False).alias("col1"),
                    pl.col("embedding_dim").cast(pl.Int32, strict=False).alias("col2"),
                    pl.col("value").cast(pl.Float32, strict=False).alias("col3"),
                )
                .filter(pl.col("col3").is_not_null())
            )
            PWorkflow(workflow=[WriteFrame(
                input_table="input_table",
                frame_name="equiv_polars",
                axes=[
                    AxisMapping(column="col1", type="String"),
                    AxisMapping(column="col2", type="Int"),
                ],
                columns=[ColumnMapping(column="col3", type="Float")],
                partition_key_length=0,
                strict=False,
            )]).execute(
                global_settings=global_settings,
                initial_table_space={"input_table": lf},
            )

            duckdb_result = self._describe(duckdb_dir)
            polars_result = self._describe(polars_dir)

            # Rows dropped by both: the null key (non-strict) and the null value.
            self.assertEqual(len(duckdb_result["rows"]), 12)
            self.assertEqual(duckdb_result["rows"], polars_result["rows"])
            self.assertEqual(duckdb_result["schema"], polars_result["schema"])
            # dataDigest is content-addressed, so equal envelopes mean equal data.
            self.assertEqual(duckdb_result["datainfo"], polars_result["datainfo"])
        finally:
            for d in (duckdb_dir, polars_dir):
                shutil.rmtree(d, ignore_errors=True)
            if os.path.exists(source):
                os.remove(source)

    def test_output_is_sorted_by_axes(self):
        source = os.path.join(test_data_root_dir, "import_source.parquet")
        pq.write_table(_long_format_table(), source)
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("sorted_frame"))
        shutil.rmtree(frame_dir, ignore_errors=True)
        try:
            PWorkflow(workflow=[_import_step("sorted_frame")]).execute(
                global_settings=global_settings
            )
            df = pl.read_parquet(os.path.join(frame_dir, "partition_0.parquet"))
            self.assertEqual(df.to_dicts(), df.sort(["col1", "col2"]).to_dicts())
        finally:
            shutil.rmtree(frame_dir, ignore_errors=True)
            if os.path.exists(source):
                os.remove(source)


if __name__ == "__main__":
    unittest.main()
