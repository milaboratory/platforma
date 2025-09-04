from typing import List, Literal, Optional, Dict
from msgspec import Struct
import msgspec.json
import os
import polars as pl
import duckdb

from ptabler.steps.util import normalize_path

from .base import PStep, StepContext
from ..common import toPolarsType

AxisType = Literal['Int', 'Long', 'String']
ColumnType = Literal['Int', 'Long', 'Float', 'Double', 'String']

class AxisMapping(Struct, rename="camel"):
    column: str
    type: AxisType

class ColumnMapping(Struct, rename="camel"):
    column: str
    type: ColumnType

class DataInfoAxis(Struct, rename="camel"):
    id: str
    type: AxisType

class DataInfoColumn(Struct, rename="camel"):
    id: str
    type: ColumnType

class NumberOfBytes(Struct, rename="camel"):
    axes: List[int]
    column: int

class Stats(Struct, rename="camel"):
    number_of_rows: Optional[int] = None
    number_of_bytes: Optional[NumberOfBytes] = None

class DataInfoPart(Struct, rename="camel"):
    data: str
    data_digest: Optional[str] = None
    stats: Optional[Stats] = None
    axes: List[DataInfoAxis]
    column: DataInfoColumn

class DataInfo(Struct, tag="ParquetPartitioned", rename="camel"):
    partition_key_length: int
    parts: Dict[str, DataInfoPart]

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
        
        if not self.axes:
            raise ValueError("At least one axis must be specified.")
        if not self.columns:
            raise ValueError("At least one column must be specified.")
        
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
        
        intermediate_parquet = os.path.join(frame_dir, normalize_path("intermediate.parquet"))
        sink_lf = sorted_lf.sink_parquet(path=intermediate_parquet, lazy=True)
        
        ctx.put_sink(sink_lf)
        
        ctx.chain_task(lambda: self.write_partitions_with_bloom_filters(intermediate_parquet))

    def write_partitions_with_bloom_filters(self, intermediate_parquet: str):
        frame_dir = os.path.dirname(intermediate_parquet)

        data_info_by_column = {}
        for column in self.columns:
            data_info_by_column[column.column] = DataInfo(
                partition_key_length=self.partition_key_length,
                parts={}
            )
        
        axes_info = [DataInfoAxis(id=axis.column, type=axis.type) for axis in self.axes]
        columns_info = {
            column.column: DataInfoColumn(id=column.column, type=column.type) for column in self.columns
        }
        def create_part_info(data_file, column):
            return DataInfoPart(
                data=data_file,
                axes=axes_info,
                column=columns_info[column.column]
            )

        axis_identifiers = [f'"{axis.column}"' for axis in self.axes]
        all_column_identifiers = axis_identifiers + [f'"{column.column}"' for column in self.columns]
        def create_part_data(data_file: str, row=None):
            conn = duckdb.connect()
            
            if row is not None:
                where_conditions = []
                for i, value in enumerate(row):
                    column_name = axis_identifiers[i]
                    if isinstance(value, str):
                        # Escape single quotes in string values
                        escaped_value = value.replace("'", "''")
                        where_conditions.append(f"{column_name} = '{escaped_value}'")
                    else:
                        where_conditions.append(f"{column_name} = {value}")
                
                query = f"""
                    WITH filtered_data AS (
                        SELECT *
                        FROM read_parquet('{intermediate_parquet}')
                        WHERE {' AND '.join(where_conditions)}
                    )
                    SELECT {', '.join(all_column_identifiers[len(row):])}
                    FROM filtered_data
                    ORDER BY {', '.join(axis_identifiers[len(row):])}
                """
            else:
                query = f"""
                    SELECT {', '.join(all_column_identifiers)}
                    FROM read_parquet('{intermediate_parquet}')
                    ORDER BY {', '.join(axis_identifiers)}
                """
            
            conn.execute(f"""
                COPY ({query})
                TO '{os.path.join(frame_dir, normalize_path(data_file))}'
                (FORMAT PARQUET, COMPRESSION 'ZSTD', COMPRESSION_LEVEL 3)
            """)
            conn.close()
        
        if self.partition_key_length > 0:
            partitioned_axes = [axis.column for axis in self.axes][:self.partition_key_length]
            distinct_axes_df = pl.read_parquet(intermediate_parquet).select(partitioned_axes).unique()
            for i, row in enumerate(distinct_axes_df.iter_rows()):
                part_key = msgspec.json.encode(list(row)).decode('utf-8')
                data_file = f"partition_{i}.parquet"
                create_part_data(data_file, row)
                for column in self.columns:
                    data_info_by_column[column.column].parts[part_key] = create_part_info(data_file, column)
        elif pl.scan_parquet(intermediate_parquet).select(pl.len()).collect().item() > 0:
            part_key = msgspec.json.encode(list()).decode('utf-8')
            data_file = "partition_0.parquet"
            create_part_data(data_file)
            for column in self.columns:
                data_info_by_column[column.column].parts[part_key] = create_part_info(data_file, column)

        for column_name, data_info in data_info_by_column.items():
            datainfo_path = os.path.join(frame_dir, f"{column_name}.datainfo")
            with open(datainfo_path, 'wb') as f:
                f.write(msgspec.json.encode(data_info))
        
        if os.path.exists(intermediate_parquet):
            os.remove(intermediate_parquet)
