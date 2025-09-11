import unittest
import os
import shutil
import polars as pl
import duckdb
import msgspec.json
import pyarrow as pa
import pyarrow.parquet as pq
from polars.testing import assert_frame_equal

from ptabler.steps import GlobalSettings
from ptabler.steps.write_frame import AxisMapping, WriteFrame, DataInfo, ColumnMapping, DataInfoPart, DataInfoAxis, DataInfoColumn, Stats, NumberOfBytes
from ptabler.steps.util import normalize_path
from ptabler.workflow.workflow import PWorkflow

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
            pl.concat_str(["axis1", "axis2", "axis3"], separator="~").chash.sha2_256()
                .alias("axes_hash"),
            pl.col("column1").cast(pl.String).chash.sha2_256()
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
    
    def test_write_empty_frame(self):
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("frame_name"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="frame_name",
            axes=[
                AxisMapping(column="id", type="Long"),
                AxisMapping(column="name", type="String"),
            ],
            columns=[ColumnMapping(column="value", type="Double")],
            partition_key_length=0
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        lf = pl.LazyFrame(schema={
            "id": pl.Int64,
            "name": pl.String,
            "value": pl.Float64,
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            ptw.execute(global_settings=global_settings, initial_table_space=ts)

            datainfo_file = os.path.join(frame_dir, "value.datainfo")
            self.assertTrue(
                os.path.exists(datainfo_file),
                "value.datainfo file should exist even for empty frame"
            )
            
            expected_data_info = DataInfo(
                partition_key_length=0,
                parts={}
            )
            expected_serialized = msgspec.json.encode(expected_data_info).decode('utf-8')
            with open(datainfo_file, 'rb') as f:
                actual_data_info = f.read().decode('utf-8')
            self.assertEqual(actual_data_info, expected_serialized)

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)
    
    def test_write_not_partitioned_frame(self):
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("frame_name"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="frame_name",
            axes=[
                AxisMapping(column="id", type="Long"),
                AxisMapping(column="name", type="String"),
            ],
            columns=[ColumnMapping(column="value", type="Double")],
            partition_key_length=0
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        lf = pl.LazyFrame({
            "id": [1, 2, 3],
            "name": ["Alice", "Bob", "Charlie"],
            "value": [10.5, 20.0, 30.5],
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            ptw.execute(global_settings=global_settings, initial_table_space=ts)

            datainfo_file = os.path.join(frame_dir, "value.datainfo")
            self.assertTrue(
                os.path.exists(datainfo_file),
                "value.datainfo file should exist even for empty frame"
            )
            
            expected_data_info = DataInfo(
                partition_key_length=0,
                parts={
                    "[]": DataInfoPart(
                        data="partition_0.parquet",
                        axes=[
                            DataInfoAxis(id="id", type="Long"),
                            DataInfoAxis(id="name", type="String")
                        ],
                        column=DataInfoColumn(id="value", type="Double"),
                        data_digest="247598c14a14e85bdf0a0171357cef2654996064fa1a8dab86d31619505fa4e8",
                        stats=Stats(
                            number_of_rows=3,
                            number_of_bytes=NumberOfBytes(
                                axes=[85, 92],
                                column=84
                            )
                        )
                    )
                }
            )
            expected_serialized = msgspec.json.encode(expected_data_info).decode('utf-8')
            with open(datainfo_file, 'rb') as f:
                actual_data_info = f.read().decode('utf-8')
            self.assertEqual(actual_data_info, expected_serialized)

            self.assertTrue(os.path.exists(os.path.join(frame_dir, "partition_0.parquet")))
            expected_df = pl.DataFrame({
                "id": [1, 2, 3],
                "name": ["Alice", "Bob", "Charlie"],
                "value": [10.5, 20.0, 30.5],
            }).sort("id")
            actual_df = pl.read_parquet(os.path.join(frame_dir, "partition_0.parquet")).sort("id")
            assert_frame_equal(actual_df, expected_df, check_dtypes=False)
            actual_schema = pq.read_schema(os.path.join(frame_dir, "partition_0.parquet"))
            self.assertEqual(actual_schema.types, [pa.int64(), pa.string(), pa.float64()])

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)
    
    def test_write_partitioned_frame(self):
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("frame_name"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="frame_name",
            axes=[
                AxisMapping(column="id", type="Long"),
                AxisMapping(column="name", type="String"),
            ],
            columns=[ColumnMapping(column="value", type="Double")],
            partition_key_length=1
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        lf = pl.LazyFrame({
            "id": [1, 1, 2],
            "name": ["Alice", "Bob", "Charlie"],
            "value": [10.5, 20.0, 30.5],
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            ptw.execute(global_settings=global_settings, initial_table_space=ts)

            datainfo_file = os.path.join(frame_dir, "value.datainfo")
            self.assertTrue(
                os.path.exists(datainfo_file),
                "value.datainfo file should exist even for empty frame"
            )
            
            expected_data_info = DataInfo(
                partition_key_length=1,
                parts={
                    "[1]": DataInfoPart(
                        data="partition_0.parquet",
                        axes=[DataInfoAxis(id="name", type="String")],
                        column=DataInfoColumn(id="value", type="Double"),
                        data_digest="526ea7869eb6c53280dd8c408a97db169183039ab236f9e7e5516f0e583db508",
                        stats=Stats(
                            number_of_rows=2,
                            number_of_bytes=NumberOfBytes(
                                axes=[81],
                                column=81
                            )
                        )
                    ),
                    "[2]": DataInfoPart(
                        data="partition_1.parquet",
                        axes=[DataInfoAxis(id="name", type="String")],
                        column=DataInfoColumn(id="value", type="Double"),
                        data_digest="6a1370af1bce26dfab7ede772239d16c5d98a52b00efb60b3e38ebf4e9b2791f",
                        stats=Stats(
                            number_of_rows=1,
                            number_of_bytes=NumberOfBytes(
                                axes=[68],
                                column=65
                            )
                        )
                    )
                }
            )
            expected_serialized = msgspec.json.encode(expected_data_info).decode('utf-8')
            with open(datainfo_file, 'rb') as f:
                actual_data_info = f.read().decode('utf-8')
            self.assertEqual(actual_data_info, expected_serialized)

            self.assertTrue(os.path.exists(os.path.join(frame_dir, "partition_0.parquet")))
            expected_df = pl.DataFrame({
                "name": ["Alice", "Bob"],
                "value": [10.5, 20.0],
            }).sort("name")
            actual_df = pl.read_parquet(os.path.join(frame_dir, "partition_0.parquet")).sort("name")
            assert_frame_equal(actual_df, expected_df, check_dtypes=False)
            actual_schema = pq.read_schema(os.path.join(frame_dir, "partition_0.parquet"))
            self.assertEqual(actual_schema.types, [pa.string(), pa.float64()])

            self.assertTrue(os.path.exists(os.path.join(frame_dir, "partition_1.parquet")))
            expected_df = pl.DataFrame({
                "name": ["Charlie"],
                "value": [30.5],
            }).sort("name")
            actual_df = pl.read_parquet(os.path.join(frame_dir, "partition_1.parquet")).sort("name")
            assert_frame_equal(actual_df, expected_df, check_dtypes=False)
            actual_schema = pq.read_schema(os.path.join(frame_dir, "partition_1.parquet"))
            self.assertEqual(actual_schema.types, [pa.string(), pa.float64()])

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)
    
    def test_input_validation_empty_frame_name(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="input_table",
                frame_name="",
                axes=[AxisMapping(column="id", type="Long")],
                columns=[ColumnMapping(column="value", type="Double")]
            ).execute(None)
        self.assertIn("frame_name", str(cm.exception).lower())
    
    def test_input_validation_no_axes(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="input_table",
                frame_name="frame_name",
                axes=[],
                columns=[ColumnMapping(column="value", type="Double")]
            ).execute(None)
        self.assertIn("axis must be specified", str(cm.exception).lower())
    
    def test_input_validation_no_columns(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="input_table",
                frame_name="frame_name",
                axes=[AxisMapping(column="id", type="Long")],
                columns=[]
            ).execute(None)
        self.assertIn("column must be specified", str(cm.exception).lower())
    
    def test_input_validation_duplicate_column_names_axes_and_columns(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="input_table",
                frame_name="frame_name",
                axes=[AxisMapping(column="duplicate", type="Long")],
                columns=[ColumnMapping(column="duplicate", type="Double")]
            ).execute(None)
        self.assertIn("duplicate", str(cm.exception))
    
    def test_input_validation_multiple_duplicate_column_names(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="input_table",
                frame_name="frame_name",
                axes=[
                    AxisMapping(column="dup1", type="Long"),
                    AxisMapping(column="dup2", type="String")
                ],
                columns=[
                    ColumnMapping(column="dup1", type="Double"),
                    ColumnMapping(column="dup2", type="Float")
                ]
            ).execute(None)
        exception_str = str(cm.exception)
        self.assertIn("dup1", exception_str)
        self.assertIn("dup2", exception_str)
    
    def test_input_validation_partition_key_length_equals_axes_count(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="input_table",
                frame_name="frame_name",
                axes=[
                    AxisMapping(column="id", type="Long"),
                    AxisMapping(column="name", type="String")
                ],
                columns=[ColumnMapping(column="value", type="Double")],
                partition_key_length=2  # Equal to number of axes
            ).execute(None)
        self.assertIn("partition_key_length", str(cm.exception))
        self.assertIn("strictly less than", str(cm.exception))

    def test_write_frame_with_quotes_casting_reordering_nulls(self):
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("frame_name"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="frame_name",
            axes=[
                AxisMapping(column="user's_id", type="Long"),  # Single quote in name
                AxisMapping(column="item.type", type="String"),  # Dot in name
            ],
            columns=[ColumnMapping(column="us*r sc%re", type="Double")],  # Special characters in name
            partition_key_length=0
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        # Initial order: axis2, column, axis1 (item.type, us*r sc%re, user's_id)
        # Data with different types than mapping + NULLs + unsorted
        lf = pl.LazyFrame({
            "item.type": ["A", None, "B", "A", "C"],  # String (matches mapping) with NULL
            "us*r sc%re": [10, 25, None, 15, 30],  # Int (will cast to Double) with NULL
            "user's_id": [3.0, 1.0, 2.0, None, 4.0],  # Float (will cast to Long) with NULL
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            ptw.execute(global_settings=global_settings, initial_table_space=ts)

            # Verify file exists
            datainfo_file = os.path.join(frame_dir, "us*r sc%re.datainfo")
            self.assertTrue(os.path.exists(datainfo_file))
            
            expected_data_info = DataInfo(
                partition_key_length=0,
                parts={
                    "[]": DataInfoPart(
                        data="partition_0.parquet",
                        axes=[
                            DataInfoAxis(id="user's_id", type="Long"),
                            DataInfoAxis(id="item.type", type="String")
                        ],
                        column=DataInfoColumn(id="us*r sc%re", type="Double"),
                        data_digest="f442658e05050d8a04fc3190b145ac9c211f4780798b050d91a61f0719a1275d",
                        stats=Stats(
                            number_of_rows=3,
                            number_of_bytes=NumberOfBytes(
                                axes=[85, 80],
                                column=84
                            )
                        )
                    )
                }
            )
            
            expected_serialized = msgspec.json.encode(expected_data_info).decode('utf-8')
            with open(datainfo_file, 'rb') as f:
                actual_data_info = f.read().decode('utf-8')
            self.assertEqual(actual_data_info, expected_serialized)
            
            # Read and verify parquet data
            parquet_file = os.path.join(frame_dir, "partition_0.parquet")
            self.assertTrue(os.path.exists(parquet_file))
            actual_df = pl.read_parquet(parquet_file)
            
            # Expected: Only NULLs in AXIS columns are filtered out, data column NULLs remain
            # Original data: 
            # "item.type": ["A", None, "B", "A", "C"]  - row 1 has NULL (axis column)
            # "us*r sc%re": [10, 25, None, 15, 30]   - row 2 has NULL (data column, kept)  
            # "user's_id": [3.0, 1.0, 2.0, None, 4.0] - row 3 has NULL (axis column)
            # Rows with NULL in axis columns (rows 1 and 3) are filtered out
            # Remaining rows: 0, 2, 4 -> (3.0, "A", 10), (2.0, "B", None), (4.0, "C", 30)
            # After sorting by axes: user's_id, item.type
            expected_df = pl.DataFrame({
                "user's_id": [2, 3, 4],  # Long type, sorted
                "item.type": ["B", "A", "C"],  # String type, sorted by first axis then second
                "us*r sc%re": [None, 10.0, 30.0],  # Double type (cast from Int), NULL preserved
            }).cast({"us*r sc%re": pl.Float64})  # Ensure proper type
            self.assertEqual(actual_df["user's_id"].dtype, pl.Int64)  # Long
            self.assertEqual(actual_df["item.type"].dtype, pl.String)  # String  
            self.assertEqual(actual_df["us*r sc%re"].dtype, pl.Float64)  # Double
            assert_frame_equal(actual_df.sort("user's_id"), expected_df.sort("user's_id"), check_dtypes=False)

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)

    def test_write_partitioned_frame_with_special_chars_in_axis_value(self):
        """Test partitioned frame with special characters (single quote, double quote, dot, comma) in axis1 value"""
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("frame_name"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="frame_name",
            axes=[
                AxisMapping(column="axis1", type="String"),  # String type for partition key
                AxisMapping(column="axis2", type="Long"),
            ],
            columns=[ColumnMapping(column="column", type="Double")],
            partition_key_length=1  # Partition by axis1
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        # Single row with special characters in axis1 value
        lf = pl.LazyFrame({
            "axis1": ["test's \"value\", with.dot"],  # Single quote, double quote, comma, dot
            "axis2": [42],
            "column": [123.45],
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            ptw.execute(global_settings=global_settings, initial_table_space=ts)

            datainfo_file = os.path.join(frame_dir, "column.datainfo")
            self.assertTrue(os.path.exists(datainfo_file))
            
            expected_data_info = DataInfo(
                partition_key_length=1,
                parts={
                    "[\"test's \\\"value\\\", with.dot\"]": DataInfoPart(
                        data="partition_0.parquet",
                        axes=[DataInfoAxis(id="axis2", type="Long")],
                        column=DataInfoColumn(id="column", type="Double"),
                        data_digest="882c031a2cdd7cdec5a957163e4d93c7713654086ff62a23187d53a8150841bf",
                        stats=Stats(
                            number_of_rows=1,
                            number_of_bytes=NumberOfBytes(
                                axes=[65],
                                column=65
                            )
                        )
                    )
                }
            )
            expected_serialized = msgspec.json.encode(expected_data_info).decode('utf-8')
            with open(datainfo_file, 'rb') as f:
                actual_data_info = f.read().decode('utf-8')
            self.assertEqual(actual_data_info, expected_serialized)
            
            partition_file = os.path.join(frame_dir, "partition_0.parquet")
            self.assertTrue(os.path.exists(partition_file))
            actual_df = pl.read_parquet(partition_file)
            expected_df = pl.DataFrame({
                "axis2": [42],
                "column": [123.45],
            })
            assert_frame_equal(actual_df, expected_df, check_dtypes=False)

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)

    def test_one_line_dataframe_with_string_axis_parquet_schema(self):
        output_file_abs_path = os.path.join(test_data_root_dir, "outputs", "one_line_string_axis.parquet")
        
        try:
            pl.DataFrame({
                "string_axis": ["test_value"],
                "numeric_column": [42.5],
            }).write_parquet(output_file_abs_path)
            self.assertTrue(
                os.path.exists(output_file_abs_path), 
                f"Parquet file was not created at {output_file_abs_path}"
            )
            
            string_field = pq.read_schema(output_file_abs_path).field("string_axis")
            self.assertEqual(string_field.type, pa.large_string())
            
        finally:
            if os.path.exists(output_file_abs_path):
                os.remove(output_file_abs_path)

    def test_write_frame_with_string_axis_schema_assertion(self):
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("string_axis_frame"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="string_axis_frame",
            axes=[
                AxisMapping(column="string_axis", type="String"),
            ],
            columns=[ColumnMapping(column="numeric_column", type="Double")],
            partition_key_length=0
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        lf = pl.LazyFrame({
            "string_axis": ["test_value"],
            "numeric_column": [42.5],
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            ptw.execute(global_settings=global_settings, initial_table_space=ts)

            parquet_file = os.path.join(frame_dir, "partition_0.parquet")
            self.assertTrue(os.path.exists(parquet_file))
            
            actual_df = pl.read_parquet(parquet_file)
            expected_df = pl.DataFrame({
                "string_axis": ["test_value"],
                "numeric_column": [42.5],
            })
            assert_frame_equal(actual_df, expected_df, check_dtypes=False)
            self.assertEqual(pq.read_schema(parquet_file).types, [pa.string(), pa.float64()])

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)

    def test_write_frame_with_selective_axes_and_columns(self):
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("selective_frame"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="selective_frame",
            axes=[
                AxisMapping(column="axis1", type="Long"),
            ],
            columns=[ColumnMapping(column="column1", type="Double")],
            partition_key_length=0
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        lf = pl.LazyFrame({
            "axis1": [1, 2, 3],
            "axis2": ["A", "B", "C"],
            "column1": [10.5, 20.0, 30.5],
            "column2": [100, 200, 300],
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            ptw.execute(global_settings=global_settings, initial_table_space=ts)

            datainfo_file = os.path.join(frame_dir, "column1.datainfo")
            self.assertTrue(
                os.path.exists(datainfo_file),
                "column1.datainfo file should exist"
            )
            
            expected_data_info = DataInfo(
                partition_key_length=0,
                parts={
                    "[]": DataInfoPart(
                        data="partition_0.parquet",
                        axes=[
                            DataInfoAxis(id="axis1", type="Long")
                        ],
                        column=DataInfoColumn(id="column1", type="Double"),
                        data_digest="a25431d198b539431eea891de566fe019e85671789d6f3ed461e3714d53db34a",
                        stats=Stats(
                            number_of_rows=3,
                            number_of_bytes=NumberOfBytes(
                                axes=[85],
                                column=84
                            )
                        )
                    )
                }
            )
            expected_serialized = msgspec.json.encode(expected_data_info).decode('utf-8')
            with open(datainfo_file, 'rb') as f:
                actual_data_info = f.read().decode('utf-8')
            self.assertEqual(actual_data_info, expected_serialized)

            parquet_file = os.path.join(frame_dir, "partition_0.parquet")
            self.assertTrue(os.path.exists(parquet_file))
            
            actual_df = pl.read_parquet(parquet_file)
            expected_df = pl.DataFrame({
                "axis1": [1, 2, 3],
                "column1": [10.5, 20.0, 30.5],
            }).sort("axis1")
            assert_frame_equal(actual_df.sort("axis1"), expected_df, check_dtypes=False)
            
            actual_schema = pq.read_schema(parquet_file)
            self.assertEqual(actual_schema.types, [pa.int64(), pa.float64()])

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)

    def test_strict_mode_with_nulls_in_axis_failure(self):
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("strict_mode_second_axis"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="strict_mode_second_axis",
            axes=[
                AxisMapping(column="name", type="String"),
            ],
            columns=[ColumnMapping(column="value", type="Double")],
            partition_key_length=0,
            strict=True
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        lf = pl.LazyFrame({
            "name": ["Alice", None, "Charlie"],
            "value": [10.5, 20.0, 30.5],
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            with self.assertRaises(ValueError) as cm:
                ptw.execute(global_settings=global_settings, initial_table_space=ts)
            
            exception_str = str(cm.exception)
            self.assertIn("null values in axis 'name'", exception_str)

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)

if __name__ == '__main__':
    unittest.main()
