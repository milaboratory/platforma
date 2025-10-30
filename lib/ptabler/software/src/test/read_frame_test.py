from pathlib import Path
from msgspec.json import encode
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
from ptabler.steps.basics import Select
from ptabler.steps.sort import Sort, SortDirective
from ptabler.expression.selectors import (
    NumericSelectorExpression,
    StringSelectorExpression,
)
from ptabler.expression.conditional import FillNullExpression
from ptabler.expression.basics import (
    ConstantValueExpression, 
    AliasExpression, 
    ColumnReferenceExpression,
    AxisReferenceExpression,
)

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
    
    def write_frame(
        self, 
        df: pl.DataFrame, 
        axes: list[AxisSpec], 
        columns: list[PColumnSpec],
        partition_key_length: int = 0
    ) -> None:
        """
        Helper function to write a test PFrame.
        
        Args:
            df: The DataFrame to write
            axes: List of axis specifications
            columns: List of column specifications
            partition_key_length: Number of axes to use for partitioning (default: 0)
        """
        write_step = WriteFrame(
            input_table="input_data",
            frame_name=test_frame_dir,
            axes=[
                AxisMapping(column=axis.name, type=axis.type.value) for axis in axes
            ],
            columns=[
                ColumnMapping(column=column.name, type=column.value_type.value) for column in columns
            ],
            partition_key_length=partition_key_length
        )
        write_workflow = PWorkflow(workflow=[write_step])
        
        initial_table_space: TableSpace = {"input_data": df.lazy()}
        write_workflow.execute(
            global_settings=global_settings,
            initial_table_space=initial_table_space
        )
        
        for column in columns:
            spec_path = os.path.join(test_frame_folder, f"{column.name}.spec")
            with open(spec_path, 'w') as f:
                spec_json = encode(column).decode('utf-8')
                f.write(spec_json)

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
        self.write_frame(original_df, axes, columns)
        
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

    def test_xsv_export_workflow(self):
        original_df = pl.DataFrame({
            "clonotypeKey": ["clono1", "clono1", "clono2", "clono2", "clono3", "clono1"],
            "clusterId": ["cluster2", "cluster1", "cluster4", "cluster1", "cluster4", "cluster3"],
            "value1": [1, 2, 3, 4, 5, None],
            "value2": [10, 20, 30, 40, 50, None],
            "value3": [100, 200, 300, 400, 500, None],
            "value4": [1000, 2000, 3000, 4000, 5000, None],
            "value5": [10000, 20000, 30000, 40000, 50000, None],
        })
        expected_df = pl.DataFrame({
            "clonotypeKey": ["clono1", "clono1", "clono1", "clono2", "clono2", "clono3"],
            "clusterId": ["cluster1", "cluster2", "cluster3", "cluster1", "cluster4", "cluster4"],
            "Col0": ["2", "1", "", "4", "3", "5"],
            "Col1": ["20", "10", "", "40", "30", "50"],
            "Col2": ["200", "100", "", "400", "300", "500"],
            "Col3": ["2000", "1000", "", "4000", "3000", "5000"],
            "Col4": ["20000", "10000", "", "40000", "30000", "50000"],
        })
        
        axes = [
            AxisSpec(name="clonotypeKey", type=AxisType.String),
            AxisSpec(name="clusterId", type=AxisType.String)
        ]
        columns = [
            PColumnSpec(name="value1", value_type=ColumnType.Int, axes_spec=axes),
            PColumnSpec(name="value2", value_type=ColumnType.Int, axes_spec=axes),
            PColumnSpec(name="value3", value_type=ColumnType.Int, axes_spec=axes),
            PColumnSpec(name="value4", value_type=ColumnType.Int, axes_spec=axes),
            PColumnSpec(name="value5", value_type=ColumnType.Int, axes_spec=axes),
        ]
        self.write_frame(original_df, axes, columns)
        
        def run_workflow():
            read_step = ReadFrame(
                name="anonymous_1",
                request=CreateTableRequest(
                    src=FullJoin(entries=[
                        ColumnJoinEntry(column_id=column.name) for column in columns
                    ]),
                    filters=[],
                ),
                translation={column.name: f"col{i+1}" for i, column in enumerate(columns)}
            )
            sort_step = Sort(
                input_table="anonymous_1",
                output_table="anonymous_2",
                by=[
                    SortDirective(value=AxisReferenceExpression(spec=axes[0])),
                    SortDirective(value=AxisReferenceExpression(spec=axes[1])),
                ]
            )
            select_fill_null = Select(
                input_table="anonymous_2",
                output_table="anonymous_3",
                columns=[
                    FillNullExpression(
                        input=NumericSelectorExpression(),
                        fill_value=ConstantValueExpression(value="")
                    ),
                    FillNullExpression(
                        input=StringSelectorExpression(),
                        fill_value=ConstantValueExpression(value="")
                    )
                ]
            )
            select_aliases = Select(
                input_table="anonymous_3",
                output_table="anonymous_4",
                columns=[
                    AliasExpression(
                        name="clonotypeKey",
                        value=AxisReferenceExpression(spec=axes[0])
                    ),
                    AliasExpression(
                        name="clusterId",
                        value=AxisReferenceExpression(spec=axes[1])
                    ),
                    AliasExpression(name="Col0", value=ColumnReferenceExpression(name="col1")),
                    AliasExpression(name="Col1", value=ColumnReferenceExpression(name="col2")),
                    AliasExpression(name="Col2", value=ColumnReferenceExpression(name="col3")),
                    AliasExpression(name="Col3", value=ColumnReferenceExpression(name="col4")),
                    AliasExpression(name="Col4", value=ColumnReferenceExpression(name="col5")),
                ]
            )
            workflow = PWorkflow(workflow=[read_step, sort_step, select_fill_null, select_aliases])
            ctx = workflow.execute(global_settings=global_settings, lazy=True)
            
            result_lf = ctx.get_table("anonymous_4")
            result_df = result_lf.collect()
            
            _, _, chained_tasks = ctx.into_parts()
            for task in chained_tasks:
                task()
            
            return result_df
        
        for i in range(12):
            result = run_workflow()
            assert_frame_equal(expected_df, result, check_row_order=True, check_column_order=True)

    def test_pframe_non_determinism_from_real_data(self):
        pframe_test_dir = os.path.join(test_data_root_dir, "pframe_non_determinism")
        
        read_frame_step = ReadFrame(
            name="anonymous_1",
            request=CreateTableRequest(
                src=FullJoin(
                    entries=[
                        ColumnJoinEntry(column_id="pcolumn_1"),
                        ColumnJoinEntry(column_id="pcolumn_2"),
                        ColumnJoinEntry(column_id="pcolumn_3"),
                        ColumnJoinEntry(column_id="pcolumn_4"),
                        ColumnJoinEntry(column_id="pcolumn_5"),
                    ]
                ),
                filters=[],
            ),
            translation={}
        )
        
        sort_step = Sort(
            input_table="anonymous_1",
            output_table="anonymous_2",
            by=[
                SortDirective(
                    value=AxisReferenceExpression(
                        spec=AxisSpec(
                            name="pl7.app/vdj/clonotypeKey",
                            type=AxisType.String,
                        )
                    )
                ),
                SortDirective(
                    value=AxisReferenceExpression(
                        spec=AxisSpec(
                            name="pl7.app/vdj/clusterId",
                            type=AxisType.String,
                            domain={"pl7.app/vdj/clustering/blockId": "8b0b6393-b88c-4140-a81d-a8e629009c88"},
                        )
                    )
                ),
                SortDirective(
                    value=AxisReferenceExpression(
                        spec=AxisSpec(
                            name="pl7.app/vdj/clusterId",
                            type=AxisType.String,
                            domain={"pl7.app/vdj/clustering/blockId": "9480a1fd-e78b-4d46-b17e-8034b34b2d8b"},
                        )
                    )
                ),
            ]
        )
        
        select_fill_null_step = Select(
            input_table="anonymous_2",
            output_table="anonymous_3",
            columns=[
                FillNullExpression(
                    input=NumericSelectorExpression(),
                    fill_value=ConstantValueExpression(value=""),
                ),
                FillNullExpression(
                    input=StringSelectorExpression(),
                    fill_value=ConstantValueExpression(value=""),
                ),
            ]
        )
        
        select_aliases_step = Select(
            input_table="anonymous_3",
            output_table="anonymous_4",
            columns=[
                AliasExpression(
                    name="clonotypeKey",
                    value=AxisReferenceExpression(
                        spec=AxisSpec(
                            name="pl7.app/vdj/clonotypeKey",
                            type=AxisType.String,
                        )
                    )
                ),
                AliasExpression(
                    name="clusterAxis_0_0",
                    value=AxisReferenceExpression(
                        spec=AxisSpec(
                            name="pl7.app/vdj/clusterId",
                            type=AxisType.String,
                            domain={"pl7.app/vdj/clustering/blockId": "8b0b6393-b88c-4140-a81d-a8e629009c88"},
                        )
                    )
                ),
                AliasExpression(
                    name="clusterAxis_1_0",
                    value=AxisReferenceExpression(
                        spec=AxisSpec(
                            name="pl7.app/vdj/clusterId",
                            type=AxisType.String,
                            domain={"pl7.app/vdj/clustering/blockId": "9480a1fd-e78b-4d46-b17e-8034b34b2d8b"},
                        )
                    )
                ),
                ColumnReferenceExpression(name="pcolumn_1"),
                ColumnReferenceExpression(name="pcolumn_2"),
                ColumnReferenceExpression(name="pcolumn_3"),
                ColumnReferenceExpression(name="pcolumn_4"),
                ColumnReferenceExpression(name="pcolumn_5"),
            ]
        )
        
        workflow_without_write = PWorkflow(workflow=[
            read_frame_step,
            sort_step,
            select_fill_null_step,
            select_aliases_step,
        ])
        
        test_global_settings = GlobalSettings(
            root_folder=Path(test_data_root_dir),
            frame_folder=Path(os.path.join(pframe_test_dir, "input_frame")),
            spill_folder=Path(test_spill_folder),
        )
        
        expected_df = pl.DataFrame({
            "clonotypeKey": ["", "", "01UyLlzqUNx6RLbxrejKV", "01ygjUoVcYknCCOjeOIhE", 
                           "027Rzx9QJqhpVJIhU9Ig9", "02TsWhMABL5D4YvClKLpc", 
                           "03EIsiIsISFzlzBdIhAdv", "03GlXxIHFmpSk3QyK20LC", "05FfhfASu3pdDYuSzskqH"],
            "clusterAxis_0_0": ["", "03GlXxIHFmpSk3QyK20LC", "2FKDPHSysjXm4IYqGPtxv", 
                               "01ygjUoVcYknCCOjeOIhE", "027Rzx9QJqhpVJIhU9Ig9", 
                               "02TsWhMABL5D4YvClKLpc", "03EIsiIsISFzlzBdIhAdv", "", ""],
            "clusterAxis_1_0": ["03GlXxIHFmpSk3QyK20LC", "", "2FKDPHSysjXm4IYqGPtxv", 
                               "01ygjUoVcYknCCOjeOIhE", "027Rzx9QJqhpVJIhU9Ig9", 
                               "02TsWhMABL5D4YvClKLpc", "03EIsiIsISFzlzBdIhAdv", "", ""],
            "pcolumn_1": ["", "", "15", "14", "12", "", "", "13", "11"],
            "pcolumn_2": ["", "", "21", "22", "23", "24", "25", "", ""],
            "pcolumn_3": ["", "", "31", "32", "33", "34", "35", "", ""],
            "pcolumn_4": ["", "45", "", "41", "42", "43", "44", "", ""],
            "pcolumn_5": ["55", "", "", "51", "52", "53", "54", "", ""],
        })
        
        for i in range(12):
            ctx = workflow_without_write.execute(global_settings=test_global_settings, lazy=True)
            result_lf = ctx.get_table("anonymous_4")
            result_df = result_lf.collect()
            
            _, _, chained_tasks = ctx.into_parts()
            for task in chained_tasks:
                task()
            
            assert_frame_equal(
                expected_df, 
                result_df, 
                check_row_order=True, 
                check_column_order=True,
            )

if __name__ == '__main__':
    unittest.main()
