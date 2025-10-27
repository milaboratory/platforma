from pathlib import Path
import unittest
import os
import shutil
import polars as pl
from polars.testing import assert_frame_equal

from ptabler.steps import GlobalSettings, TableSpace
from ptabler.steps.write_frame import AxisMapping, WriteFrame, ColumnMapping
from ptabler.steps.read_frame import ReadFrame
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
test_frame_dir = "test_frame_folder"
test_frame_folder = os.path.join(test_data_root_dir, test_frame_dir)
test_spill_folder = os.path.join(test_data_root_dir, "test_spill_folder")
global_settings = GlobalSettings(
    root_folder=Path(test_data_root_dir),
    frame_folder=Path(test_frame_folder),
    spill_folder=Path(test_spill_folder),
)

class ReadFrameTests(unittest.TestCase):
    def setUp(self):
        self.tearDown()

    def tearDown(self):
        shutil.rmtree(test_frame_folder, ignore_errors=True)
        shutil.rmtree(test_spill_folder, ignore_errors=True)

    def test_frame_roundtrip(self):
        original_df = pl.DataFrame({
            "id": [1, 2, 3, 4, 5],
            "category": ["A", "B", None, "C", "B"],
            "value": [10.5, 20.0, 15.5, 25.0, None]
        })
        expected_df = pl.DataFrame({
            "id": [1, 2, 4, 5],
            "category": ["A", "B", "C", "B"],
            "value": [10.5, 20.0, 25.0, None]
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
            frame_name=test_frame_dir,
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
            name="written_data",
            request=CreateTableRequest(
                src=FullJoin(entries=[
                    ColumnJoinEntry(column_id=column.name) for column in columns
                ]),
                filters=[],
            ),
            translation={column.name: column.name for column in columns}
        )
        read_workflow = PWorkflow(workflow=[read_step])
        
        initial_table_space: TableSpace = {"input_data": original_df.lazy()}
        write_workflow.execute(
            global_settings=global_settings,
            initial_table_space=initial_table_space
        )
        
        for column in columns:
            spec_path = os.path.join(test_frame_folder, f"{column.name}.spec")
            with open(spec_path, 'w') as f:
                import msgspec
                spec_json = msgspec.json.encode(column).decode('utf-8')
                f.write(spec_json)
        
        read_ctx = read_workflow.execute(global_settings=global_settings, lazy=True)
        final_lf = read_ctx.get_table("written_data")
        
        actual_df = final_lf.select([
            *[AxisReferenceExpression(spec=axis).to_polars().alias(axis.name) for axis in axes],
            *[pl.col(column.name) for column in columns]
        ]).collect()
        
        _, _, chained_tasks = read_ctx.into_parts()
        for task in chained_tasks:
            task()
        
        all_column_refs = [axis.name for axis in axes] + [column.name for column in columns]
        expected_df = expected_df.sort(all_column_refs)
        actual_df = actual_df.sort(all_column_refs)
        
        assert_frame_equal(expected_df, actual_df, check_row_order=False)
    
    def test_nonexistent_frame_folder_error(self):
        read_step = ReadFrame(
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="value"),
                filters=[]
            ),
            translation={}
        )
        workflow = PWorkflow(workflow=[read_step])
        
        with self.assertRaises(ValueError) as cm:
            workflow.execute(global_settings=global_settings)
        self.assertIn("is not an existing directory", str(cm.exception))
    
    def test_not_defined_frame_folder_error(self):
        read_step = ReadFrame(
            name="test",
            request=CreateTableRequest(
                src=ColumnJoinEntry(column_id="value"),
                filters=[]
            ),
            translation={}
        )
        workflow = PWorkflow(workflow=[read_step])
        
        with self.assertRaises(ValueError) as cm:
            workflow.execute(global_settings=GlobalSettings(
                root_folder=Path(test_data_root_dir),
                frame_folder=None,
                spill_folder=None,
            ))
        self.assertIn("Frame folder is not set", str(cm.exception))

if __name__ == '__main__':
    unittest.main()
