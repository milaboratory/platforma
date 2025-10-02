import unittest
import os
import shutil
import polars as pl
from polars.testing import assert_frame_equal

from ptabler.steps import GlobalSettings, TableSpace
from ptabler.steps.write_frame import AxisMapping, WriteFrame, ColumnMapping
from ptabler.steps.read_frame import ReadFrame
from ptabler.steps.io import ColumnSchema
from ptabler.workflow.workflow import PWorkflow
from polars_pf.json.join import CreateTableRequest, ColumnJoinEntry, FullJoin
from polars_pf import AxisSpec, PColumnSpec
from polars_pf.json.spec import AxisType, ColumnType
from ptabler.expression.basics import AxisReferenceExpression

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data",
)
global_settings = GlobalSettings(root_folder=test_data_root_dir)

class ReadFrameTests(unittest.TestCase):
    def setUp(self):
        self.test_frame_dir = "test_frame_output"
        self.test_frame_path = os.path.join(test_data_root_dir, self.test_frame_dir)
        if os.path.exists(self.test_frame_path):
            shutil.rmtree(self.test_frame_path)

    def tearDown(self):
        if os.path.exists(self.test_frame_path):
            shutil.rmtree(self.test_frame_path)

    def test_frame_roundtrip(self):
        original_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "category": ["A", "B", "A", "C", "B"],
            "value": [10.5, 20.0, 15.5, 25.0, 12.5]
        })

        axes = [
            AxisSpec(name="id", type=AxisType.Long),
            AxisSpec(name="category", type=AxisType.String)
        ]
        columns = [
            PColumnSpec(name="value", value_type=ColumnType.Double, axes_spec=axes)
        ]
        
        write_step = WriteFrame(
            input_table="input_data",
            frame_name=self.test_frame_dir,
            axes=[
                AxisMapping(column=axis.name, type=axis.type.value) for axis in axes
            ],
            columns=[
                ColumnMapping(column=column.name, type=column.value_type.value) for column in columns
            ],
            partition_key_length=0
        )
        write_workflow = PWorkflow(workflow=[write_step])
        
        read_step = ReadFrame(
            directory=self.test_frame_dir,
            name="written_data",
            request=CreateTableRequest(
                src=FullJoin(entries=[
                    ColumnJoinEntry(column_id=column.name) for column in columns
                ]),
                filters=[],
            )
        )
        read_workflow = PWorkflow(workflow=[read_step])
        
        initial_table_space: TableSpace = {"input_data": original_df.lazy()}
        write_workflow.execute(
            global_settings=global_settings,
            initial_table_space=initial_table_space
        )
        
        for column in columns:
            spec_path = os.path.join(self.test_frame_path, f"{column.name}.spec")
            with open(spec_path, 'w') as f:
                import msgspec
                spec_json = msgspec.json.encode(column).decode('utf-8')
                f.write(spec_json)
        
        final_lf = read_workflow.execute(global_settings=global_settings, lazy=True).get_table("written_data")
        
        final_df = final_lf.select([
            *[AxisReferenceExpression(spec=axis).to_polars().alias(axis.name) for axis in axes],
            *[pl.col(column.name) for column in columns]
        ]).collect()
        
        all_column_refs = [axis.name for axis in axes] + [column.name for column in columns]
        expected_df = original_df.sort(all_column_refs)
        actual_df = final_df.sort(all_column_refs)
        
        assert_frame_equal(expected_df, actual_df, check_row_order=False)

    def test_empty_directory_error(self):
        read_step = ReadFrame(
            directory="",
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="value"),
                filters=[]
            )
        )
        workflow = PWorkflow(workflow=[read_step])
        
        with self.assertRaises(ValueError) as cm:
            workflow.execute(global_settings=global_settings)
        
        exception_str = str(cm.exception)
        self.assertIn("The 'directory' cannot be empty.", exception_str)

    def test_directory_path_error(self):
        read_step = ReadFrame(
            directory="path/to/frame",
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="value"),
                filters=[]
            )
        )
        workflow = PWorkflow(workflow=[read_step])
        
        with self.assertRaises(ValueError) as cm:
            workflow.execute(global_settings=global_settings)
        
        exception_str = str(cm.exception)
        self.assertIn("The 'directory' must be a directory name, not a path.", exception_str)

    def test_nonexistent_directory_error(self):
        read_step = ReadFrame(
            directory="nonexistent_frame",
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="value"),
                filters=[]
            )
        )
        workflow = PWorkflow(workflow=[read_step])
        
        with self.assertRaises(ValueError) as cm:
            workflow.execute(global_settings=global_settings)
        
        exception_str = str(cm.exception)
        self.assertIn("The 'directory' is not an existing directory:", exception_str)

    def test_spill_path_validation(self):
        os.makedirs(self.test_frame_path, exist_ok=True)
        
        read_step = ReadFrame(
            directory=self.test_frame_dir,
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="value"),
                filters=[]
            ),
            spill_path="path/to/spill"
        )
        workflow = PWorkflow(workflow=[read_step])

        with self.assertRaises(ValueError) as cm:
            workflow.execute(global_settings=global_settings)
        
        exception_str = str(cm.exception)
        self.assertIn("The 'spill_path' must be a directory name, not a path.", exception_str)
        
        shutil.rmtree(self.test_frame_path)

    def test_spill_path_automatic_cleanup(self):
        original_df = pl.DataFrame({
            "id": [1, 2],
            "value": [10.5, 20.0]
        })
        
        axes = [AxisSpec(name="id", type=AxisType.Long)]
        columns = [PColumnSpec(name="value", value_type=ColumnType.Double, axes_spec=axes)]
        
        write_step = WriteFrame(
            input_table="input_data",
            frame_name=self.test_frame_dir,
            axes=[AxisMapping(column=axis.name, type=axis.type.value) for axis in axes],
            columns=[ColumnMapping(column=column.name, type=column.value_type.value) for column in columns],
            partition_key_length=0
        )
        
        write_workflow = PWorkflow(workflow=[write_step])
        initial_table_space: TableSpace = {"input_data": original_df.lazy()}
        write_workflow.execute(
            global_settings=global_settings,
            initial_table_space=initial_table_space
        )
        
        for column in columns:
            spec_path = os.path.join(self.test_frame_path, f"{column.name}.spec")
            with open(spec_path, 'w') as f:
                import msgspec
                spec_json = msgspec.json.encode(column).decode('utf-8')
                f.write(spec_json)
        
        
        read_step_valid = ReadFrame(
            directory=self.test_frame_dir,
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="value"),
                filters=[]
            ),
            spill_path="spill_dir"
        )
        
        spill_dir_path = os.path.join(test_data_root_dir, "spill_dir")
        self.assertFalse(os.path.exists(spill_dir_path), "Spill directory should not exist initially")
        
        read_workflow = PWorkflow(workflow=[read_step_valid])
        context = read_workflow.execute(global_settings=global_settings, lazy=True)
        self.assertTrue(os.path.exists(spill_dir_path), "Spill directory should be created during execution")

        _, _, chained_tasks = context.into_parts()
        for task in chained_tasks:
            task()
        self.assertFalse(os.path.exists(spill_dir_path), "Spill directory should be cleaned up after executing chained tasks")
    
    def test_schema_casting(self):
        original_df = pl.DataFrame({
            "id": [1, 2, 3],
            "str_number": ["10", "20", "30"],
            "category": ["A", "B", "C"]
        })
        
        axes = [AxisSpec(name="id", type=AxisType.Long)]
        columns = [
            PColumnSpec(name="str_number", value_type=ColumnType.String, axes_spec=axes),
            PColumnSpec(name="category", value_type=ColumnType.String, axes_spec=axes)
        ]
        
        write_step = WriteFrame(
            input_table="input_data",
            frame_name=self.test_frame_dir,
            axes=[AxisMapping(column=axis.name, type=axis.type.value) for axis in axes],
            columns=[ColumnMapping(column=column.name, type=column.value_type.value) for column in columns],
            partition_key_length=0
        )
        
        read_step = ReadFrame(
            directory=self.test_frame_dir,
            name="test",
            request=CreateTableRequest(
                src=FullJoin(entries=[
                    ColumnJoinEntry(column_id=column.name) for column in columns
                ]),
                filters=[]
            ),
            schema=[
                ColumnSchema(column="str_number", type="Long"),  # Cast string to Long
                ColumnSchema(column="category", type="String")
            ]
        )
        
        write_workflow = PWorkflow(workflow=[write_step])
        initial_table_space: TableSpace = {"input_data": original_df.lazy()}
        write_workflow.execute(
            global_settings=global_settings,
            initial_table_space=initial_table_space
        )
        
        for column in columns:
            spec_path = os.path.join(self.test_frame_path, f"{column.name}.spec")
            with open(spec_path, 'w') as f:
                import msgspec
                spec_json = msgspec.json.encode(column).decode('utf-8')
                f.write(spec_json)
        
        read_workflow = PWorkflow(workflow=[read_step])
        context = read_workflow.execute(global_settings=global_settings, lazy=True)
        
        result_df = context.get_table("test").sort("str_number").collect()
        
        self.assertEqual(result_df["str_number"].dtype, pl.Int64)
        self.assertEqual(list(result_df["str_number"]), [10, 20, 30])

    def test_schema_null_value_handling(self):
        original_df = pl.DataFrame({
            "id": [1, 2, 3, 4],
            "nullable_field": ["NULL", "NULL", "10", "30"]  # NULL strings should become None
        })
        
        axes = [AxisSpec(name="id", type=AxisType.Long)]
        columns = [PColumnSpec(name="nullable_field", value_type=ColumnType.String, axes_spec=axes)]
        
        write_step = WriteFrame(
            input_table="input_data",
            frame_name=self.test_frame_dir,
            axes=[AxisMapping(column=axis.name, type=axis.type.value) for axis in axes],
            columns=[ColumnMapping(column=column.name, type=column.value_type.value) for column in columns],
            partition_key_length=0
        )
        
        read_step = ReadFrame(
            directory=self.test_frame_dir,
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="nullable_field"),
                filters=[]
            ),
            schema=[
                ColumnSchema(column="nullable_field", type="Long", null_value="NULL")  # "NULL" strings become None, then cast to Long
            ]
        )
        
        write_workflow = PWorkflow(workflow=[write_step])
        initial_table_space: TableSpace = {"input_data": original_df.lazy()}
        write_workflow.execute(
            global_settings=global_settings,
            initial_table_space=initial_table_space
        )
        
        for column in columns:
            spec_path = os.path.join(self.test_frame_path, f"{column.name}.spec")
            with open(spec_path, 'w') as f:
                import msgspec
                spec_json = msgspec.json.encode(column).decode('utf-8')
                f.write(spec_json)
        
        read_workflow = PWorkflow(workflow=[read_step])
        context = read_workflow.execute(global_settings=global_settings, lazy=True)
        
        result_df = context.get_table("test").sort("nullable_field").collect()
        
        self.assertEqual(result_df["nullable_field"].dtype, pl.Int64)
        expected_values = [None, None, 10, 30]  # "NULL" strings converted to None, then cast to Long
        actual_values = result_df["nullable_field"].to_list()
        self.assertEqual(actual_values, expected_values)

    def test_n_rows_limit(self):
        original_df = pl.DataFrame({
            "id": list(range(1, 11)),  # 10 rows
            "value": [f"value_{i}" for i in range(1, 11)]
        })
        
        axes = [AxisSpec(name="id", type=AxisType.Long)]
        columns = [PColumnSpec(name="value", value_type=ColumnType.String, axes_spec=axes)]
        
        write_step = WriteFrame(
            input_table="input_data",
            frame_name=self.test_frame_dir,
            axes=[AxisMapping(column=axis.name, type=axis.type.value) for axis in axes],
            columns=[ColumnMapping(column=column.name, type=column.value_type.value) for column in columns],
            partition_key_length=0
        )
        
        read_step = ReadFrame(
            directory=self.test_frame_dir,
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="value"),
                filters=[]
            ),
            n_rows=3  # Only read first 3 rows
        )
        
        write_workflow = PWorkflow(workflow=[write_step])
        initial_table_space: TableSpace = {"input_data": original_df.lazy()}
        write_workflow.execute(
            global_settings=global_settings,
            initial_table_space=initial_table_space
        )
        
        for column in columns:
            spec_path = os.path.join(self.test_frame_path, f"{column.name}.spec")
            with open(spec_path, 'w') as f:
                import msgspec
                spec_json = msgspec.json.encode(column).decode('utf-8')
                f.write(spec_json)
        
        read_workflow = PWorkflow(workflow=[read_step])
        context = read_workflow.execute(global_settings=global_settings, lazy=True)
        
        result_df = context.get_table("test").sort("value").collect()
        
        self.assertEqual(len(result_df), 3)
        self.assertEqual(list(result_df["value"]), ["value_1", "value_2", "value_3"])

if __name__ == '__main__':
    unittest.main()
