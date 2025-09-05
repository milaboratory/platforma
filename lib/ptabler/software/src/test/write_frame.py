import unittest
import os
import polars as pl
import polars_hash as plh
import duckdb

from ptabler.steps import GlobalSettings

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data",
)
global_settings = GlobalSettings(root_folder=test_data_root_dir)

class WriteFrameTests(unittest.TestCase):
    def test_empty_parquet_write_and_read(self):
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

    def test_polars_hash_for_non_string_columns(self):
        lf = pl.DataFrame({
            "axis1": ["A", "B", "C", "A", "B"],
            "axis2": [1, 2, 3, 1, 2], 
            "axis3": [10.5, 20.5, 30.5, 10.5, 20.5],
            "column1": [True, False, True, False, True],
        })
            
        result = lf.select([
            plh.concat_str(["axis1", "axis2", "axis3"], separator="~").chash.sha2_256()
                .alias("axes_hash"),
            plh.col("column1").cast(pl.String).chash.sha2_256()
                .alias("column_hash"),
        ])

        axes_hash = result["axes_hash"][0]
        self.assertIsInstance(axes_hash, str)
        self.assertEqual(len(axes_hash), 64)  # SHA256 produces 64 hex characters

        column_hash = result["column_hash"][0]
        self.assertIsInstance(column_hash, str)
        self.assertEqual(len(column_hash), 64)  # SHA256 produces 64 hex characters
    
    def test_duckdb_read_parquet_metadata(self):
        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", "metadata_test.parquet")
        conn = duckdb.connect()

        try:
            conn.execute(f"""
                COPY (
                    SELECT
                        i AS int_column,
                        i * 1.5 AS float_column
                    FROM range(1, 101) t(i)
                )
                TO '{output_file_abs_path}' 
                (FORMAT PARQUET, COMPRESSION 'ZSTD', COMPRESSION_LEVEL 3)
            """)
            
            self.assertTrue(os.path.exists(output_file_abs_path))
            
            result = conn.execute(f"""
                SELECT num_rows
                FROM parquet_file_metadata('{output_file_abs_path}')
            """).fetchall()
            
            self.assertEqual(result[0][0], 100, "Row group should contain 100 rows")

            result = conn.execute(f"""
                SELECT SUM(total_compressed_size) AS total_compressed_size, path_in_schema
                FROM parquet_metadata('{output_file_abs_path}')
                WHERE path_in_schema = 'int_column'
                GROUP BY path_in_schema
            """).fetchall()

            print(result)
            
        finally:
            conn.close()
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

if __name__ == '__main__':
    unittest.main()
