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

if __name__ == '__main__':
    unittest.main()
