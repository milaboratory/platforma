from typing import List, Literal
from msgspec import Struct
import os
import polars as pl

from ptabler.steps.util import normalize_path

from .base import PStep, StepContext
from ..common import toPolarsType

AxisType = Literal['Int', 'Long', 'String']
ColumnType = Literal['Int', 'Long', 'Float', 'Double', 'String']

class AxisMapping(Struct):
    column: str
    type: AxisType

class ColumnMapping(Struct):
    column: str
    type: ColumnType

class WriteFrame(PStep, tag="write_frame"):
    """
    PStep to create a PFrame from provided lazy table.

    Corresponds to the WriteFrameStep defined in the TypeScript type definitions.
    """
    input_table: str
    frame_name: str
    axes: List[AxisMapping]
    columns: List[ColumnMapping]
    partition_key_length: int = 0

    def execute(self, ctx: StepContext):
        if not self.frame_name or not self.frame_name.strip():
            raise ValueError("The 'frame_name' cannot be empty.")
        
        axis_columns = [axis.column for axis in self.axes]
        column_columns = [column.column for column in self.columns]
        all_columns = axis_columns + column_columns
        if len(all_columns) != len(set(all_columns)):
            duplicates = list(set(axis_columns) & set(column_columns))
            raise ValueError(f"Column identifiers used in both axes and columns: [{', '.join(duplicates)}]")
        
        if self.partition_key_length >= len(self.axes):
            raise ValueError(
                f"The 'partition_key_length' ({self.partition_key_length}) must be "
                f"strictly less than the number of axes ({len(self.axes)})."
            )
        
        lf = ctx.take_table(self.input_table)

        frame_dir = os.path.join(ctx.settings.root_folder, normalize_path(self.frame_name))
        os.makedirs(frame_dir)

        cast_expressions = []
        for axis in self.axes:
            cast_expressions.append(pl.col(axis.column).cast(toPolarsType(axis.type)))
        for column in self.columns:
            cast_expressions.append(pl.col(column.column).cast(toPolarsType(column.type), strict=False))
        projected_lf = lf.select(cast_expressions)

        filter_expressions = [pl.col(axis.column).is_not_null() for axis in self.axes]
        filtered_lf = projected_lf.filter(pl.all_horizontal(filter_expressions))
        
        sorted_lf = filtered_lf.sort([axis.column for axis in self.axes], nulls_last=False)
        
        output_path = os.path.join(frame_dir, normalize_path("intermediate.parquet"))
        sink_lf = sorted_lf.sink_parquet(path=output_path, lazy=True)
        
        ctx.put_sink(sink_lf)
        
        def write_parquet_partitions_with_bloom_filters():
            # TODO: Implement
            pass
        
        ctx.chain_task(write_parquet_partitions_with_bloom_filters)
