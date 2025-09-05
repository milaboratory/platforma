from typing import List, Literal, Optional, Dict
from msgspec import Struct
import msgspec.json
import os
import polars as pl
import polars_hash as plh
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
    axes: List[DataInfoAxis]
    column: DataInfoColumn
    data_digest: Optional[str] = None
    stats: Optional[Stats] = None

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
        try:
            frame_dir = os.path.dirname(intermediate_parquet)
            duckdb_conn = duckdb.connect(database=':memory:')

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
            def create_part_info(data_file, column, number_of_rows, axes_hash, axes_number_of_bytes):
                data_path = os.path.join(frame_dir, normalize_path(data_file))
                lf = pl.scan_parquet(data_path)

                column_hash = lf.select(
                    plh.col(column.column).cast(pl.String).chash.sha2_256().alias("column_hash")
                ).collect()["column_hash"][0]
                column_number_of_bytes = self.get_number_of_bytes_in_column(duckdb_conn, data_path, column.column)
                data_digest = f"{axes_hash}{column_hash}"
                
                return DataInfoPart(
                    data=data_file,
                    axes=axes_info,
                    column=columns_info[column.column],
                    data_digest=data_digest,
                    stats=Stats(
                        number_of_rows=number_of_rows,
                        number_of_bytes=NumberOfBytes(
                            axes=axes_number_of_bytes,
                            column=column_number_of_bytes,
                        )),
                )
            
            def get_reusable_part_info(data_file, column):
                data_path = os.path.join(frame_dir, normalize_path(data_file))
                lf = pl.scan_parquet(data_path)

                number_of_rows = self.get_number_of_rows_in_column(duckdb_conn, data_path, column.column)
                axes_hash = lf.select(
                    plh.concat_str([axis.id for axis in axes_info], separator="~").chash.sha2_256()
                        .alias("axes_hash")
                ).collect()["axes_hash"][0]
                axes_number_of_bytes = [
                    self.get_number_of_bytes_in_column(duckdb_conn, data_path, axis.id) for axis in axes_info
                ]
                return number_of_rows, axes_hash, axes_number_of_bytes

            axis_identifiers = [f'"{axis.column}"' for axis in self.axes]
            all_column_identifiers = axis_identifiers + [f'"{column.column}"' for column in self.columns]
            def create_part_data(data_file: str, row=None):
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
                
                duckdb_conn.execute(f"""
                    COPY ({query})
                    TO '{os.path.join(frame_dir, normalize_path(data_file))}'
                    (FORMAT PARQUET, COMPRESSION 'ZSTD', COMPRESSION_LEVEL 3)
                """)
            
            if self.partition_key_length > 0:
                partitioned_axes = [axis.column for axis in self.axes][:self.partition_key_length]
                distinct_axes_df = pl.read_parquet(intermediate_parquet).select(partitioned_axes).unique()
                for i, row in enumerate(distinct_axes_df.iter_rows()):
                    part_key = msgspec.json.encode(list(row)).decode('utf-8')
                    data_file = f"partition_{i}.parquet"
                    create_part_data(data_file, row)
                    nrows, axes_hash, axes_nbytes = get_reusable_part_info(data_file, column)
                    for column in self.columns:
                        part_info = create_part_info(data_file, column, nrows, axes_hash, axes_nbytes)
                        data_info_by_column[column.column].parts[part_key] = part_info
            elif pl.scan_parquet(intermediate_parquet).select(pl.len()).collect().item() > 0:
                part_key = msgspec.json.encode(list()).decode('utf-8')
                data_file = "partition_0.parquet"
                create_part_data(data_file)
                nrows, axes_hash, axes_nbytes = get_reusable_part_info(data_file, column)
                for column in self.columns:
                    part_info = create_part_info(data_file, column, nrows, axes_hash, axes_nbytes)
                    data_info_by_column[column.column].parts[part_key] = part_info

            for column_name, data_info in data_info_by_column.items():
                datainfo_path = os.path.join(frame_dir, f"{column_name}.datainfo")
                with open(datainfo_path, 'wb') as f:
                    f.write(msgspec.json.encode(data_info))
            
        finally:
            duckdb_conn.close()
            if os.path.exists(intermediate_parquet):
                os.remove(intermediate_parquet)
    
    def get_number_of_bytes_in_column(conn: duckdb.DuckDBPyConnection, path: str, column_name: str) -> int:
        result = conn.execute(f"""
            SELECT SUM(total_compressed_size) AS total_compressed_size, path_in_schema
            FROM parquet_metadata('{path}')
            WHERE path_in_schema = '{column_name}'
            GROUP BY path_in_schema
        """).fetchall()
        return result[0][0]

    def get_number_of_rows_in_column(conn: duckdb.DuckDBPyConnection, path: str, column_name: str) -> int:
        result = conn.execute(f"""
            SELECT num_rows
            FROM parquet_file_metadata('{path}')
            WHERE path_in_schema = '{column_name}'
        """).fetchall()
        return result[0][0]
