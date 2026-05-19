from typing import List, Literal, Optional, Dict
from msgspec import Struct
import msgspec.json
import os
import polars as pl
import duckdb
import hashlib
import pyarrow.parquet as pq

from .base import PStep, StepContext
from ..common import toPolarsType

type AxisType = Literal['Int', 'Long', 'String']
type ColumnType = Literal['Int', 'Long', 'Float', 'Double', 'String']

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
    data_digest: str
    stats: Optional[Stats] = None

class DataInfo(Struct, tag="ParquetPartitioned", rename="camel"):
    partition_key_length: int
    parts: Dict[str, DataInfoPart]

def hash(prefix: str, lf: pl.LazyFrame, expr: pl.Expr) -> str:
    hasher = hashlib.sha256(prefix.encode())
    data = lf.select(expr.cast(pl.String).chash.sha2_256()).collect()
    [hasher.update((h if h is not None else "|~|").encode()) for (h,) in data.iter_rows()]
    return hasher.hexdigest()

def get_column_null_count(conn: duckdb.DuckDBPyConnection, path: str, column_name: str):
    result = conn.execute("""
        SELECT SUM(stats_null_count), path_in_schema
        FROM parquet_metadata(?)
        WHERE path_in_schema = ?
        GROUP BY path_in_schema
    """, [path, column_name]).fetchall()
    return result[0][0]

def get_number_of_bytes_in_column(conn: duckdb.DuckDBPyConnection, path: str, column_name: str) -> int:
    result = conn.execute("""
        SELECT SUM(total_uncompressed_size), path_in_schema
        FROM parquet_metadata(?)
        WHERE path_in_schema = ?
        GROUP BY path_in_schema
    """, [path, column_name]).fetchall()
    return result[0][0]

def get_number_of_rows_in_column(conn: duckdb.DuckDBPyConnection, path: str) -> int:
    result = conn.execute("""
        SELECT num_rows
        FROM parquet_file_metadata(?)
    """, [path]).fetchall()
    return result[0][0]

def escape(name):
    return f'"{name.replace('"', '""')}"'

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
    strict: bool = False

    def execute(self, ctx: StepContext):
        if not self.frame_name or not self.frame_name.strip():
            raise ValueError("The 'frame_name' cannot be empty.")
        if self.frame_name != os.path.basename(self.frame_name):
            raise ValueError("The 'frame_name' must be a directory name, not a path.")
        
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
        
        if self.partition_key_length < 0 or self.partition_key_length >= len(self.axes):
            raise ValueError(
                f"The 'partition_key_length' ({self.partition_key_length}) must be "
                f"strictly less than the number of axes ({len(self.axes)})."
            )
        
        lf = ctx.get_table(self.input_table)

        frame_dir = os.path.join(ctx.settings.root_folder, self.frame_name)
        os.makedirs(frame_dir)

        cast_expressions = []
        for axis in self.axes:
            cast_expressions.append(pl.col(axis.column).cast(toPolarsType(axis.type)))
        for column in self.columns:
            cast_expressions.append(pl.col(column.column).cast(toPolarsType(column.type), strict=False))
        lf = lf.select(cast_expressions)

        if not self.strict:
            filter_expressions = [pl.col(axis.column).is_not_null() for axis in self.axes]
            lf = lf.filter(pl.all_horizontal(filter_expressions))
        
        lf = lf.sort([axis.column for axis in self.axes], nulls_last=False)
        
        intermediate_parquet = os.path.join(frame_dir, "intermediate.parquet")
        lf = lf.sink_parquet(path=intermediate_parquet, lazy=True)
        
        ctx.add_sink(lf)
        
        ctx.chain_task(lambda: self.write_partitions_with_bloom_filters(intermediate_parquet))

    def write_partitions_with_bloom_filters(self, intermediate_parquet: str):
        try:
            frame_dir = os.path.dirname(intermediate_parquet)
            duckdb_conn = duckdb.connect(database=':memory:')
            duckdb_conn.execute("SET temp_directory TO ?;", [frame_dir])

            if self.strict:
                for axis in self.axes:
                    null_count = get_column_null_count(duckdb_conn, intermediate_parquet, axis.column)
                    if null_count > 0:
                        raise ValueError(f"Found {null_count} null values in axis '{axis.column}'.")
            
            axis_identifiers = [escape(axis.column) for axis in self.axes]
            duplicate_check = duckdb_conn.execute(f"""
                SELECT {', '.join(axis_identifiers)}, COUNT(*) as count
                FROM read_parquet(?)
                GROUP BY {', '.join(axis_identifiers)}
                HAVING COUNT(*) > 1
                LIMIT 1
            """, [intermediate_parquet]).fetchall()
            
            if duplicate_check:
                duplicate_row = duplicate_check[0]
                duplicate_values = list(duplicate_row[:-1])
                raise ValueError(
                    f"Multiple rows with the same axis key: {duplicate_values} detected. "
                    "Consider aggregation or adding another axis."
                )

            data_info_by_column = {}
            for column in self.columns:
                data_info_by_column[column.column] = DataInfo(
                    partition_key_length=self.partition_key_length,
                    parts={}
                )
            
            non_partitioned_axes = self.axes[self.partition_key_length:]
            axes_info = [DataInfoAxis(id=axis.column, type=axis.type) for axis in non_partitioned_axes]
            columns_info = {
                column.column: DataInfoColumn(id=column.column, type=column.type) for column in self.columns
            }
            def create_part_info(data_file, column, nrows, axes_hash, axes_nbytes):
                data_path = os.path.join(frame_dir, data_file)

                column_hash = hash(column.type, pl.scan_parquet(data_path), pl.col(column.column))
                column_nbytes = get_number_of_bytes_in_column(duckdb_conn, data_path, column.column)
                data_digest = hashlib.sha256(f"{axes_hash}{column_hash}".encode()).hexdigest()
                
                return DataInfoPart(
                    data=data_file,
                    axes=axes_info,
                    column=columns_info[column.column],
                    data_digest=data_digest,
                    stats=Stats(
                        number_of_rows=nrows,
                        number_of_bytes=NumberOfBytes(
                            axes=axes_nbytes,
                            column=column_nbytes,
                        ),
                    ),
                )
            
            def get_common_part_info(data_file, column):
                data_path = os.path.join(frame_dir, data_file)

                nrows = get_number_of_rows_in_column(duckdb_conn, data_path)
                axes_hash = hash(
                    "~".join([axis.type for axis in axes_info]),
                    pl.scan_parquet(data_path),
                    pl.concat_str([axis.id for axis in axes_info], separator="~"),
                )
                axes_nbytes = [
                    get_number_of_bytes_in_column(duckdb_conn, data_path, axis.id) for axis in axes_info
                ]
                return nrows, axes_hash, axes_nbytes
            
            axis_identifiers = [escape(axis.column) for axis in self.axes]
            all_column_identifiers = axis_identifiers + [escape(column.column) for column in self.columns]
            def create_part_data(data_file: str, row=None):
                query_params = [intermediate_parquet]
                if row is not None:
                    where_conditions = []
                    for i, value in enumerate(row):
                        where_conditions.append(f"{axis_identifiers[i]} = ?")
                        query_params.append(value)

                    query = f"""
                        WITH filtered_data AS (
                            SELECT *
                            FROM read_parquet(?)
                            WHERE {' AND '.join(where_conditions)}
                        )
                        SELECT {', '.join(all_column_identifiers[len(row):])}
                        FROM filtered_data
                        ORDER BY {', '.join(axis_identifiers[len(row):])}
                    """
                    sort_axis_names = [axis.column for axis in self.axes[len(row):]]
                else:
                    query = f"""
                        SELECT {', '.join(all_column_identifiers)}
                        FROM read_parquet(?)
                        ORDER BY {', '.join(axis_identifiers)}
                    """
                    sort_axis_names = [axis.column for axis in self.axes]

                # We stream the DuckDB result into a PyArrow ParquetWriter rather
                # than using `COPY ... TO ... (FORMAT PARQUET, ...)`. Reasons:
                #   * PyArrow writes the Parquet Page Index (column index +
                #     offset index), which DuckDB does not (duckdb/duckdb#2755).
                #     The Page Index is what lets DataFusion's DynamicFilter
                #     join pushdown prune at sub-row-group granularity on the
                #     right side of a left join. Without it a 100-key probe on
                #     a sorted right side still reads the full column chunk.
                #   * Bloom filters are written for every column (axes and
                #     value columns alike): the UI issues exact-match lookups
                #     on value columns, not just on join keys.
                #   * `sorting_columns` metadata is declared so readers can
                #     rely on the sort without inferring it.
                # Streaming preserves larger-than-memory writes: one row group
                # at a time, same memory profile as DuckDB's COPY.
                row_group_size = 122880
                count_params = query_params[:]
                if row is not None:
                    count_query = f"SELECT COUNT(*) FROM read_parquet(?) WHERE {' AND '.join(where_conditions)}"
                else:
                    count_query = "SELECT COUNT(*) FROM read_parquet(?)"
                total_rows = duckdb_conn.execute(count_query, count_params).fetchone()[0]
                reader = duckdb_conn.execute(query, query_params).fetch_record_batch(
                    rows_per_batch=row_group_size,
                )
                schema = reader.schema
                schema_names = list(schema.names)
                # Polars sorts with nulls_last=False (line 137), so declare
                # nulls_first=True here. In practice axis columns have no nulls
                # by the time they get here (filtered out in non-strict mode,
                # raised on in strict mode), but the metadata should still
                # match the sort the writer actually performed.
                sorting_columns = [
                    pq.SortingColumn(schema_names.index(name), descending=False, nulls_first=True)
                    for name in sort_axis_names
                ]
                bloom_filter_options = {
                    name: {'ndv': max(total_rows, 1), 'fpp': 0.05}
                    for name in schema_names
                }
                out_path = os.path.join(frame_dir, data_file)
                with pq.ParquetWriter(
                    out_path,
                    schema,
                    compression='zstd',
                    compression_level=3,
                    use_dictionary=True,
                    write_statistics=True,
                    # We need the offset index first of all (the data-page
                    # byte-range table that lets DataFusion seek directly to
                    # a candidate page after a row-group prune). It's emitted
                    # together with the column index by this single flag.
                    write_page_index=True,
                    write_page_checksum=True,
                    dictionary_pagesize_limit=256 * 1024,
                    data_page_size=256 * 1024,
                    bloom_filter_options=bloom_filter_options,
                    sorting_columns=sorting_columns,
                    version='2.6',
                    # We need DataPage v2: v1 layout is tuned for sequential
                    # scans (definition/repetition levels compressed inline
                    # with values), but our access pattern includes point
                    # reads where we decode a single page out of a chunk.
                    data_page_version='2.0',
                ) as writer:
                    for batch in reader:
                        writer.write_batch(batch)
            
            if self.partition_key_length > 0:
                partitioned_axes = [axis.column for axis in self.axes][:self.partition_key_length]
                distinct_axes_df = pl.read_parquet(intermediate_parquet).select(partitioned_axes).unique()
                for i, row in enumerate(distinct_axes_df.iter_rows()):
                    part_key = msgspec.json.encode(list(row)).decode('utf-8')
                    data_file = f"partition_{i}.parquet"
                    create_part_data(data_file, row)
                    nrows, axes_hash, axes_nbytes = get_common_part_info(data_file, column)
                    for column in self.columns:
                        part_info = create_part_info(data_file, column, nrows, axes_hash, axes_nbytes)
                        data_info_by_column[column.column].parts[part_key] = part_info
            elif pl.scan_parquet(intermediate_parquet).select(pl.len()).collect().item() > 0:
                part_key = msgspec.json.encode(list()).decode('utf-8')
                data_file = "partition_0.parquet"
                create_part_data(data_file)
                nrows, axes_hash, axes_nbytes = get_common_part_info(data_file, column)
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
