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
    maxDiff = None
    
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
                        data_digest="2f269f4d875838522664842e2bba6f580ac9898df8eab4ef3b7941c784961572",
                        stats=Stats(
                            number_of_rows=3,
                            number_of_bytes=NumberOfBytes(
                                axes=[66, 69],
                                column=66
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
                        data_digest="c4070b5df733973e7cdc4060a0b5454e9b829ffb9b5222ee7aa3d08dd783e718",
                        stats=Stats(
                            number_of_rows=2,
                            number_of_bytes=NumberOfBytes(
                                axes=[57],
                                column=57
                            )
                        )
                    ),
                    "[2]": DataInfoPart(
                        data="partition_1.parquet",
                        axes=[DataInfoAxis(id="name", type="String")],
                        column=DataInfoColumn(id="value", type="Double"),
                        data_digest="5308529447672d700c681e93ebe41d8100eb6af58581be80fd00fb69f6d1c674",
                        stats=Stats(
                            number_of_rows=1,
                            number_of_bytes=NumberOfBytes(
                                axes=[52],
                                column=49
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
    
    def test_input_validation_frame_name_with_path(self):
        with self.assertRaises(ValueError) as cm:
            WriteFrame(
                input_table="input_table",
                frame_name="path/to/frame",
                axes=[AxisMapping(column="id", type="Long")],
                columns=[ColumnMapping(column="value", type="Double")]
            ).execute(None)
        self.assertIn("directory name, not a path", str(cm.exception))
    
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
            columns=[ColumnMapping(column='us*r "sc%re"', type="Double")],  # Special characters in name
            partition_key_length=0
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        # Initial order: axis2, column, axis1 (item.type, us*r "sc%re", user's_id)
        # Data with different types than mapping + NULLs + unsorted
        lf = pl.LazyFrame({
            "item.type": ["A", None, "B", "A", "C"],  # String (matches mapping) with NULL
            'us*r "sc%re"': [10, 25, None, 15, 30],  # Int (will cast to Double) with NULL
            "user's_id": [3.0, 1.0, 2.0, None, 4.0],  # Float (will cast to Long) with NULL
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            ptw.execute(global_settings=global_settings, initial_table_space=ts)

            # Verify file exists
            datainfo_file = os.path.join(frame_dir, 'us*r "sc%re".datainfo')
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
                        column=DataInfoColumn(id='us*r "sc%re"', type="Double"),
                        data_digest="6a1134916a7af2be13f77ade445cd084a3196d725a445e46e17301ea5d99d68f",
                        stats=Stats(
                            number_of_rows=3,
                            number_of_bytes=NumberOfBytes(
                                axes=[66, 57],
                                column=57
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
            # 'us*r "sc%re"': [10, 25, None, 15, 30]   - row 2 has NULL (data column, kept)  
            # "user's_id": [3.0, 1.0, 2.0, None, 4.0] - row 3 has NULL (axis column)
            # Rows with NULL in axis columns (rows 1 and 3) are filtered out
            # Remaining rows: 0, 2, 4 -> (3.0, "A", 10), (2.0, "B", None), (4.0, "C", 30)
            # After sorting by axes: user's_id, item.type
            expected_df = pl.DataFrame({
                "user's_id": [2, 3, 4],  # Long type, sorted
                "item.type": ["B", "A", "C"],  # String type, sorted by first axis then second
                'us*r "sc%re"': [None, 10.0, 30.0],  # Double type (cast from Int), NULL preserved
            }).cast({'us*r "sc%re"': pl.Float64})  # Ensure proper type
            self.assertEqual(actual_df["user's_id"].dtype, pl.Int64)  # Long
            self.assertEqual(actual_df["item.type"].dtype, pl.String)  # String  
            self.assertEqual(actual_df['us*r "sc%re"'].dtype, pl.Float64)  # Double
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
                        data_digest="1680161128e9ac671159aa6e343206a731f41234bf455ab1ac31208302544696",
                        stats=Stats(
                            number_of_rows=1,
                            number_of_bytes=NumberOfBytes(
                                axes=[49],
                                column=49
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
                        data_digest="20ef062a74c50d88a14691e169cad0343fc3311c79962cb7ca828af66d7fdf8e",
                        stats=Stats(
                            number_of_rows=3,
                            number_of_bytes=NumberOfBytes(
                                axes=[66],
                                column=66
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

    def test_duplicate_axis_values_failure(self):
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("duplicate_axis"))
        
        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="duplicate_axis",
            axes=[
                AxisMapping(column="key", type="String"),
            ],
            columns=[ColumnMapping(column="value", type="Long")],
            partition_key_length=0
        )
        ptw = PWorkflow(workflow=[write_frame_step])

        lf = pl.LazyFrame({
            "key": ["A", "B", "A"],
            "value": [1, 2, 3],
        })
        ts = {"input_table": lf}

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)

        try:
            with self.assertRaises(ValueError) as cm:
                ptw.execute(global_settings=global_settings, initial_table_space=ts)
            
            exception_str = str(cm.exception)
            self.assertIn("multiple rows with the same axis key", exception_str.lower())
            self.assertIn("A", exception_str)

        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)

    def _assert_join_pushdown_metadata(
        self,
        parquet_file: str,
        bloom_axes: list[str],
        value_columns: list[str],
        expected_num_row_groups: int | None = None,
    ):
        """
        Verifies that a written parquet carries the metadata DataFusion's
        HashJoin DynamicFilter pushdown needs to prune the right side of a
        left join without reading the full column chunk:

          1. Bloom filter present on every axis (join-key) column, in every
             row group. Verified via DuckDB's `parquet_metadata` which exposes
             per-(row_group, column) bloom_filter_offset. PyArrow 24's
             ParquetReader has no `read_bloom_filter` method, and
             pyarrow.metadata.to_dict() doesn't expose the offset either.
          2. Bloom filter absent on the listed value columns (would be wasted
             bytes — value columns are never probed by joins).
          3. Page Index (column index + offset index) on every (row group,
             column). DuckDB does NOT write this (duckdb/duckdb#2755), which
             is why the writer was switched to PyArrow.
          4. `sorting_columns` metadata declared per row group, in the order
             the writer sorted, ascending. Readers won't rely on the data
             being sorted unless this is declared.
          5. Dictionary encoding on axis columns — prerequisite for the bloom.
        """
        pf = pq.ParquetFile(parquet_file)
        md = pf.metadata

        # Parquet format version pin — '2.6' enables encodings DataFusion uses.
        self.assertEqual(md.format_version, '2.6', "parquet format version must be 2.6")
        if expected_num_row_groups is not None:
            self.assertEqual(md.num_row_groups, expected_num_row_groups)
        else:
            self.assertGreaterEqual(md.num_row_groups, 1)

        schema_names = [md.schema.column(i).name for i in range(md.num_columns)]
        # Schema sanity: no duplicate column names, every advertised axis/value
        # is actually in the file.
        self.assertEqual(
            len(set(schema_names)), len(schema_names),
            f"duplicate column names in schema: {schema_names}",
        )
        for name in bloom_axes + value_columns:
            self.assertIn(name, schema_names, f"column {name!r} not in file schema")

        # Dictionary encoding on axes — checked BEFORE the bloom assertion
        # below because dict encoding is the precondition for bloom-filter
        # generation. If the dictionary is gone, bloom is also gone; running
        # this check first surfaces the root cause rather than the symptom.
        for rg_idx in range(md.num_row_groups):
            rg = md.row_group(rg_idx)
            for axis_name in bloom_axes:
                col = rg.column(schema_names.index(axis_name))
                self.assertTrue(
                    col.has_dictionary_page,
                    f"row group {rg_idx} axis {axis_name!r} must be dictionary-encoded "
                    f"(otherwise the bloom filter would not be written)",
                )

        # Bloom filter presence per (row_group, path) — must NOT collapse rows
        # across row groups; a regression that drops the bloom on later row
        # groups would otherwise slip through.
        con = duckdb.connect()
        try:
            rows = con.execute(
                """
                SELECT row_group_id, path_in_schema, bloom_filter_offset, bloom_filter_length
                FROM parquet_metadata(?)
                """,
                [parquet_file],
            ).fetchall()
        finally:
            con.close()
        bloom_by_rg_path = {(rg, path): (off, length) for rg, path, off, length in rows}
        # Cover every row group × every relevant column.
        for rg_idx in range(md.num_row_groups):
            for axis_name in bloom_axes:
                self.assertIn(
                    (rg_idx, axis_name), bloom_by_rg_path,
                    f"row group {rg_idx} has no metadata row for axis {axis_name!r}",
                )
                off, length = bloom_by_rg_path[(rg_idx, axis_name)]
                self.assertIsNotNone(
                    off,
                    f"row group {rg_idx} axis {axis_name!r} must have a bloom filter "
                    f"(bloom_filter_offset is NULL)",
                )
                self.assertIsNotNone(
                    length,
                    f"row group {rg_idx} axis {axis_name!r} bloom_filter_length is NULL",
                )
            for value_name in value_columns:
                self.assertIn((rg_idx, value_name), bloom_by_rg_path)
                off, length = bloom_by_rg_path[(rg_idx, value_name)]
                self.assertIsNone(
                    off,
                    f"row group {rg_idx} value column {value_name!r} should NOT carry "
                    f"a bloom filter (only axes are probed by joins)",
                )
                self.assertIsNone(length)

        # Page index (column index + offset index) per (row group, column).
        # pyarrow exposes presence via has_column_index / has_offset_index;
        # the actual offsets aren't surfaced in the Python API.
        for rg_idx in range(md.num_row_groups):
            rg = md.row_group(rg_idx)
            for col_idx in range(rg.num_columns):
                col = rg.column(col_idx)
                self.assertTrue(
                    col.has_column_index,
                    f"row group {rg_idx} column {col.path_in_schema!r} "
                    f"is missing column index (Parquet Page Index) — "
                    f"sub-row-group pruning will not work",
                )
                self.assertTrue(
                    col.has_offset_index,
                    f"row group {rg_idx} column {col.path_in_schema!r} "
                    f"is missing offset index (Parquet Page Index)",
                )

        # sorting_columns metadata: per row group, points at the axes in
        # writer order, ascending. nulls_first is intentionally not asserted —
        # axis columns never carry nulls (filtered or rejected upstream), so
        # the writer's `nulls_first` value is unobservable and locking it
        # would constrain a reasonable refactor of the polars sort options.
        axis_indices = {name: schema_names.index(name) for name in bloom_axes}
        for rg_idx in range(md.num_row_groups):
            sorting_columns = md.row_group(rg_idx).sorting_columns
            self.assertEqual(
                len(sorting_columns), len(bloom_axes),
                f"row group {rg_idx}: expected {len(bloom_axes)} sorting columns "
                f"(one per axis), got {len(sorting_columns)}",
            )
            for axis_name, sc in zip(bloom_axes, sorting_columns):
                self.assertEqual(
                    sc.column_index, axis_indices[axis_name],
                    f"row group {rg_idx}: sorting column does not point at {axis_name!r}",
                )
                self.assertFalse(
                    sc.descending,
                    f"row group {rg_idx} axis {axis_name!r}: sort must be ascending",
                )

    def test_parquet_metadata_for_join_pushdown(self):
        """Single row-group, non-partitioned: smoke-tests the metadata contract."""
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("metadata_frame"))

        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="metadata_frame",
            axes=[
                AxisMapping(column="axis1", type="Long"),
                AxisMapping(column="axis2", type="String"),
            ],
            columns=[ColumnMapping(column="value", type="Double")],
            partition_key_length=0,
        )
        ptw = PWorkflow(workflow=[write_frame_step])
        lf = pl.LazyFrame({
            "axis1": [3, 1, 2, 4, 5],
            "axis2": ["c", "a", "b", "d", "e"],
            "value": [30.0, 10.0, 20.0, 40.0, 50.0],
        })

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)
        try:
            ptw.execute(global_settings=global_settings, initial_table_space={"input_table": lf})
            parquet_file = os.path.join(frame_dir, "partition_0.parquet")
            self.assertTrue(os.path.exists(parquet_file))

            self._assert_join_pushdown_metadata(
                parquet_file,
                bloom_axes=["axis1", "axis2"],
                value_columns=["value"],
                expected_num_row_groups=1,
            )

            # Data still reads back sorted by the declared axes.
            actual = pl.read_parquet(parquet_file)
            self.assertEqual(actual["axis1"].to_list(), [1, 2, 3, 4, 5])
            self.assertEqual(actual["axis2"].to_list(), ["a", "b", "c", "d", "e"])
        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)

    def test_parquet_metadata_multi_row_group(self):
        """
        Multi-row-group write: with >ROW_GROUP_SIZE rows the writer flushes more
        than one row group. This is the case where the QA-critical "bloom must
        be present on EVERY row group, not just the first" guarantee bites — a
        single-row-group test cannot catch a regression that emits the bloom
        for only the first batch.

        We also exercise the page-index contract on a file that has multiple
        pages per row group, which is the regime DataFusion actually exploits
        for sub-row-group pruning.
        """
        # Just over 2× the writer's ROW_GROUP_SIZE (122880) → 3 row groups.
        n_rows = 122880 * 2 + 1000
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("multi_rg_frame"))

        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="multi_rg_frame",
            axes=[AxisMapping(column="axis1", type="Long")],
            columns=[ColumnMapping(column="value", type="Double")],
            partition_key_length=0,
        )
        ptw = PWorkflow(workflow=[write_frame_step])
        lf = pl.LazyFrame({
            "axis1": list(range(n_rows)),
            "value": [float(i) for i in range(n_rows)],
        })

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)
        try:
            ptw.execute(global_settings=global_settings, initial_table_space={"input_table": lf})
            parquet_file = os.path.join(frame_dir, "partition_0.parquet")
            self.assertTrue(os.path.exists(parquet_file))

            # Three row groups expected at 122880-row batching.
            md = pq.ParquetFile(parquet_file).metadata
            self.assertGreater(md.num_row_groups, 1, "test must exercise multi-row-group path")

            self._assert_join_pushdown_metadata(
                parquet_file,
                bloom_axes=["axis1"],
                value_columns=["value"],
                # don't pin the exact number — robust to writer chunking changes
                expected_num_row_groups=None,
            )

            # Every row group is sorted within itself, and the min/max of
            # consecutive row groups don't overlap — that's what makes
            # row-group-level pruning possible on the join side. Without this
            # check the test would still pass if the writer sorted globally
            # but happened to shuffle rows across row groups.
            prev_max: int | None = None
            for rg_idx in range(md.num_row_groups):
                col = md.row_group(rg_idx).column(0)  # axis1 is column 0
                stats = col.statistics
                self.assertIsNotNone(stats)
                if prev_max is not None:
                    self.assertGreater(
                        stats.min, prev_max,
                        f"row group {rg_idx} min {stats.min} overlaps prev row group "
                        f"max {prev_max} — DataFusion row-group pruning will be lossy",
                    )
                prev_max = stats.max
        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)

    def test_parquet_metadata_partitioned(self):
        """
        Partitioned write: `create_part_data(row=...)` builds a different
        `sort_axis_names` (the non-partition axes only) and writes one parquet
        per distinct partition key. This branch is the one most likely to drift
        on a refactor — the partition axes must NOT appear in the file schema
        (the partition value is encoded in the file name + DataInfoPart), and
        the bloom/sort metadata must reference only the non-partition axes.
        """
        frame_dir = os.path.join(global_settings.root_folder, normalize_path("partitioned_md_frame"))

        write_frame_step = WriteFrame(
            input_table="input_table",
            frame_name="partitioned_md_frame",
            axes=[
                AxisMapping(column="pkey", type="String"),
                AxisMapping(column="axis2", type="Long"),
            ],
            columns=[ColumnMapping(column="value", type="Double")],
            partition_key_length=1,
        )
        ptw = PWorkflow(workflow=[write_frame_step])
        lf = pl.LazyFrame({
            "pkey": ["A", "A", "A", "B", "B"],
            "axis2": [3, 1, 2, 2, 1],
            "value": [10.0, 20.0, 30.0, 40.0, 50.0],
        })

        if os.path.exists(frame_dir):
            shutil.rmtree(frame_dir)
        try:
            ptw.execute(global_settings=global_settings, initial_table_space={"input_table": lf})

            # Two partition files (one per distinct pkey).
            part_files = sorted(
                f for f in os.listdir(frame_dir) if f.endswith(".parquet")
            )
            self.assertEqual(len(part_files), 2, f"expected 2 partition files, got {part_files}")

            for part_file in part_files:
                full = os.path.join(frame_dir, part_file)
                schema_names = pq.read_schema(full).names
                self.assertIn("axis2", schema_names)
                self.assertIn("value", schema_names)
                self.assertNotIn(
                    "pkey", schema_names,
                    f"partition-key axis 'pkey' must not appear in {part_file} schema "
                    f"(it's encoded in the file name and DataInfoPart)",
                )

                # Bloom + sort metadata reference only the remaining axes —
                # i.e. axis2, not pkey. This is the branch the original
                # single-test coverage missed.
                self._assert_join_pushdown_metadata(
                    full,
                    bloom_axes=["axis2"],
                    value_columns=["value"],
                )
        finally:
            if os.path.exists(frame_dir):
                shutil.rmtree(frame_dir)


if __name__ == '__main__':
    unittest.main()
