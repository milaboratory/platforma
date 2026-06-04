import unittest
import os
import tempfile
import polars as pl
from polars.testing import assert_frame_equal
from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, ReadCsv, WriteCsv
from ptabler.steps.io import ColumnSchema

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data")
global_settings = GlobalSettings(root_folder=test_data_root_dir)

class BasicTests(unittest.TestCase):

    def test_workflow_read_tsv_write_csv(self):

        input_file_relative_path = "test_data_1.tsv"
        output_file_relative_path = "output_simple_test.csv"

        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_step = ReadCsv(
            file=input_file_relative_path,
            name="input_table_from_tsv",
            delimiter="\t"
        )

        write_step = WriteCsv(
            table="input_table_from_tsv",
            file=f"outputs/{output_file_relative_path}",
            columns=["id", "name", "value1", "category"]
        )

        ptw = PWorkflow(workflow=[read_step, write_step])

        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")

        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)


class ReadCsvEmptyFileTests(unittest.TestCase):
    """Tests for ReadCsv with raise_if_empty=False on zero-byte input."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.empty_path = os.path.join(self.tmpdir, "empty.tsv")
        open(self.empty_path, "w").close()  # 0 bytes
        self.settings = GlobalSettings(root_folder=self.tmpdir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_zero_byte_with_schema_yields_empty_typed_frame(self):
        step = ReadCsv(
            file="empty.tsv",
            name="t",
            delimiter="\t",
            schema=[
                ColumnSchema(column="a", type="String"),
                ColumnSchema(column="b", type="Long"),
            ],
            infer_schema=False,
            raise_if_empty=False,
        )
        ptw = PWorkflow(workflow=[step])
        ctx = ptw.execute(global_settings=self.settings, lazy=True)
        table_space, _, _ = ctx.into_parts()
        df = table_space["t"].collect()
        assert_frame_equal(
            df,
            pl.DataFrame(schema={"a": pl.Utf8, "b": pl.Int64}),
        )

    def test_zero_byte_default_still_raises(self):
        step = ReadCsv(
            file="empty.tsv",
            name="t",
            delimiter="\t",
        )
        ptw = PWorkflow(workflow=[step])
        ctx = ptw.execute(global_settings=self.settings, lazy=True)
        table_space, _, _ = ctx.into_parts()
        with self.assertRaises(pl.exceptions.NoDataError):
            table_space["t"].collect()
