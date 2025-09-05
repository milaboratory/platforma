import unittest
import os

from ptabler.steps import GlobalSettings
from ptabler.steps.io import ReadNdjson, ReadParquet, WriteNdjson, WriteParquet
from ptabler.workflow.workflow import PWorkflow

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data",
)
global_settings = GlobalSettings(root_folder=test_data_root_dir)

class ParquetTests(unittest.TestCase):
    def test_parquet_roundtrip(self):
        """Test reading Parquet, writing Parquet - roundtrip test"""
        input_file_relative_path = "test_data_1.ndjson"
        intermediate_file_relative_path = "output_parquet_roundtrip.parquet"
        output_file_relative_path = "output_ndjson_roundtrip.ndjson"

        intermediate_file_abs_path = os.path.join(test_data_root_dir, "outputs", intermediate_file_relative_path)
        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", output_file_relative_path)

        read_ndjson_step = ReadNdjson(
            file=input_file_relative_path,
            name="roundtrip_table"
        )

        write_parquet_step = WriteParquet(
            table="roundtrip_table",
            file=f"outputs/{intermediate_file_relative_path}"
        )

        read_parquet_step = ReadParquet(
            file=f"outputs/{intermediate_file_relative_path}",
            name="roundtrip_table"
        )

        write_ndjson_step = WriteNdjson(
            table="roundtrip_table",
            file=f"outputs/{output_file_relative_path}"
        )

        ptw1 = PWorkflow(workflow=[read_ndjson_step, write_parquet_step])
        ptw2 = PWorkflow(workflow=[read_parquet_step, write_ndjson_step])

        if os.path.exists(intermediate_file_abs_path):
            os.remove(intermediate_file_abs_path)
        if os.path.exists(output_file_abs_path):
            os.remove(output_file_abs_path)

        try:
            ptw1.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(intermediate_file_abs_path),
                            f"Output file was not created at {intermediate_file_abs_path}")
            
            ptw2.execute(global_settings=global_settings)
            self.assertTrue(os.path.exists(output_file_abs_path),
                            f"Output file was not created at {output_file_abs_path}")
            
            # Verify the output file has content
            with open(output_file_abs_path, 'r') as f:
                lines = f.readlines()
                self.assertGreater(len(lines), 0, "Output file should not be empty")

        finally:
            if os.path.exists(intermediate_file_abs_path):
                os.remove(intermediate_file_abs_path)
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

if __name__ == '__main__':
    unittest.main()
