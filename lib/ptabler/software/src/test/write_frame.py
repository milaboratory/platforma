import unittest
import os
import polars as pl

from ptabler.steps import GlobalSettings

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data",
)
global_settings = GlobalSettings(root_folder=test_data_root_dir)

class WriteFrameTests(unittest.TestCase):
    def test_empty_parquet_write_and_read(self):
        """Ensure that Polars creates a Parquet file on disk even if the DataFrame has no rows"""
        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", "empty.parquet")

        empty_lazy_df = pl.LazyFrame(schema={"axis": pl.String, "column": pl.Int64})
        empty_lazy_df.sink_parquet(output_file_abs_path)
        
        try:
            self.assertTrue(
                os.path.exists(output_file_abs_path), 
                f"Parquet file was not created at {output_file_abs_path}",
            )
            
            output_df = pl.read_parquet(output_file_abs_path)

            self.assertEqual(len(output_df), 0, "DataFrame should have no rows")
            self.assertEqual(
                list(output_df.columns),
                ["axis", "column"], 
                "DataFrame should have correct column names",
            )
            
        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

if __name__ == '__main__':
    unittest.main()
