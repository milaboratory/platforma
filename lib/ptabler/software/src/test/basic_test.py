import unittest
import os
from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, ReadCsv, WriteCsv

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data")
global_settings = GlobalSettings(root_folder=test_data_root_dir)

class BasicTest(unittest.TestCase):

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
