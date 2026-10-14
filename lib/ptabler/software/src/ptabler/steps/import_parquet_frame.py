"""Import a Parquet file straight into a PFrame, without Polars.

`read_parquet` + `select`/`with_columns`/`filter` + `write_frame` is the shape the
SDK emits for every Parquet XSV import, and Polars indexes rows with a u32, so that
chain refuses any file over 2^32 rows (MILAB-7195). The work it does is a projection,
a cast, a null filter and a sort, which is one DuckDB statement, and `write_frame`
already hands its sorted output to `polars_pf.convert` rather than writing it with
Polars. This step fuses the chain into that statement: DuckDB reads, casts, filters
and sorts in one out-of-core pass, then `convert` writes the PFrame exactly as
`write_frame` does. No Polars frame is ever constructed, so no row ceiling applies.

The SDK selects this path per import via `importEngine: "duckdb"`, and only when the
spec needs nothing this step does not implement (preProcess, naRegex, filterOutRegex,
an index axis). Everything else keeps the Polars chain.
"""
from typing import List, Mapping, Optional
import os
import shutil

import duckdb
from msgspec import Struct
from polars_pf import AxisMapping, ColumnMapping, ConversionParams, convert

from .base import PStep, StepContext
from .memory import set_duckdb_memory_limit
from .util import step_file_path
from .write_frame import ROW_GROUP_SIZE, _escape

__all__ = ["ImportAxisMapping", "ImportColumnMapping", "ImportParquetFrame"]


# PColumn / PTabler type names to DuckDB types. Mirrors STRING_TO_POLARS_TYPE in
# ptabler.common, including its Int/Long/Float/Double aliases, so a spec that casts
# one way under Polars casts the same way here.
STRING_TO_DUCKDB_TYPE: Mapping[str, str] = {
    "Int8": "TINYINT",
    "Int16": "SMALLINT",
    "Int32": "INTEGER",
    "Int64": "BIGINT",
    "UInt8": "UTINYINT",
    "UInt16": "USMALLINT",
    "UInt32": "UINTEGER",
    "UInt64": "UBIGINT",
    "Float32": "FLOAT",
    "Float64": "DOUBLE",
    "Boolean": "BOOLEAN",
    "String": "VARCHAR",
    "Date": "DATE",
    "Datetime": "TIMESTAMP",
    "Time": "TIME",
    # Aliases
    "Int": "INTEGER",
    "Long": "BIGINT",
    "Float": "FLOAT",
    "Double": "DOUBLE",
}


def to_duckdb_type(type_name: str) -> str:
    try:
        return STRING_TO_DUCKDB_TYPE[type_name]
    except KeyError:
        raise ValueError(f"Unsupported type for DuckDB import: {type_name!r}") from None


class ImportAxisMapping(Struct, rename="camel"):
    column: str
    """Output field name in the written PFrame (the SDK's colN)."""
    type: str
    """Axis type, as in write_frame."""
    source: Optional[str] = None
    """Field name in the source Parquet. Defaults to `column`."""

    @property
    def source_field(self) -> str:
        return self.source if self.source is not None else self.column


class ImportColumnMapping(Struct, rename="camel"):
    column: str
    """Output field name in the written PFrame (the SDK's colN)."""
    type: str
    """Value type, as in write_frame."""
    source: Optional[str] = None
    """Field name in the source Parquet. Defaults to `column`."""
    not_null: bool = False
    """Drop rows where this value is null, matching the import's allowNA=false filter."""

    @property
    def source_field(self) -> str:
        return self.source if self.source is not None else self.column


def build_import_query(
    step: "ImportParquetFrame", source_path: str, target_path: str
) -> str:
    """The whole import as one statement: cast in an inner SELECT so the null filters
    and the sort see the cast values (a bare alias is not in scope in WHERE), then COPY
    the ordered result out. TRY_CAST, not CAST, because the Polars chain this replaces
    casts with strict=false: an unparseable value becomes null and is then dropped by
    the filters below rather than failing the run."""
    projection = ", ".join(
        f"TRY_CAST({_escape(m.source_field)} AS {to_duckdb_type(m.type)}) AS {_escape(m.column)}"
        for m in list(step.axes) + list(step.columns)
    )
    conditions = [f"{_escape(c.column)} IS NOT NULL" for c in step.columns if c.not_null]
    if not step.strict:
        # write_frame drops rows with a null axis when not strict; a failed TRY_CAST
        # on an axis lands here too.
        conditions += [f"{_escape(a.column)} IS NOT NULL" for a in step.axes]
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    order_by = ", ".join(f"{_escape(a.column)} ASC NULLS FIRST" for a in step.axes)
    return f"""
        COPY (
            SELECT * FROM (
                SELECT {projection}
                FROM read_parquet({_sql_literal(source_path)})
            ){where}
            ORDER BY {order_by}
        )
        TO {_sql_literal(target_path)}
        (
            PRESERVE_ORDER TRUE,
            FORMAT PARQUET,
            ROW_GROUP_SIZE {ROW_GROUP_SIZE},
            COMPRESSION 'UNCOMPRESSED'
        )
    """


def _sql_literal(value: str) -> str:
    """Quote a SQL string literal. read_parquet and COPY TO take their paths inline
    rather than as bind parameters, so the path is escaped here."""
    return "'" + value.replace("'", "''") + "'"


class ImportParquetFrame(PStep, tag="import_parquet_frame"):
    """Read a Parquet file and write it out as a PFrame, entirely in DuckDB.

    Replaces read_parquet + select + with_columns + filter + write_frame for the
    imports the SDK marks with `importEngine: "duckdb"`. Touches no tablespace table:
    it takes a file and produces a frame directory.
    """

    file: str
    """Path to the source Parquet, resolved like every other step's `file`."""
    frame_name: str
    """Frame directory to write, as in write_frame."""
    axes: List[ImportAxisMapping]
    columns: List[ImportColumnMapping]
    partition_key_length: int = 0
    strict: bool = False

    def execute(self, ctx: StepContext) -> None:
        self._validate()

        source_path = step_file_path(ctx.settings.root_folder, self.file)
        frame_dir = os.path.join(ctx.settings.root_folder, self.frame_name)
        os.makedirs(frame_dir)

        if ctx.settings.spill_folder is None:
            spill_dir = frame_dir
            temp_dir = frame_dir
        else:
            spill_dir = str(ctx.settings.spill_folder)
            temp_dir = os.path.join(spill_dir, f"import_parquet_frame-{self.frame_name}")
            os.makedirs(temp_dir, exist_ok=True)

        intermediate_parquet = os.path.join(temp_dir, "intermediate.parquet")
        try:
            self._sort(source_path, intermediate_parquet, spill_dir)
            self._convert(intermediate_parquet, frame_dir)
        finally:
            if temp_dir != frame_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)

    def _sort(self, source_path: str, intermediate_parquet: str, spill_dir: str) -> None:
        conn = duckdb.connect(database=":memory:")
        try:
            conn.execute("SET temp_directory TO ?;", [spill_dir])
            memory_log = set_duckdb_memory_limit(conn)
            if memory_log is not None:
                print(f"import_parquet_frame: {memory_log}", flush=True)
            conn.execute(build_import_query(self, source_path, intermediate_parquet))
        finally:
            conn.close()

    def _convert(self, intermediate_parquet: str, frame_dir: str) -> None:
        params = ConversionParams(
            frame_dir=frame_dir,
            axes=[AxisMapping(column=a.column, type=a.type) for a in self.axes],
            columns=[ColumnMapping(column=c.column, type=c.type) for c in self.columns],
            partition_key_length=self.partition_key_length,
            strict=self.strict,
            zstd_level=3,
            row_group_size=ROW_GROUP_SIZE,
            bloom_filter_fpp=0.05,
            data_page_size=256 * 1024,
            dict_page_size_limit=256 * 1024,
            column_index_truncate_length=None,
            digest_prefix="v02-",
        )
        try:
            convert(intermediate_parquet, params)
        finally:
            if os.path.exists(intermediate_parquet):
                os.remove(intermediate_parquet)

    def _validate(self) -> None:
        if not self.frame_name or not self.frame_name.strip():
            raise ValueError("The 'frame_name' cannot be empty.")
        if self.frame_name != os.path.basename(self.frame_name):
            raise ValueError("The 'frame_name' must be a directory name, not a path.")
        if not self.axes:
            raise ValueError("At least one axis must be specified.")
        if not self.columns:
            raise ValueError("At least one column must be specified.")
        if not 0 <= self.partition_key_length < len(self.axes):
            raise ValueError(
                "The 'partition_key_length' must be less than the number of axes,"
                f" got {self.partition_key_length} for {len(self.axes)} axes."
            )
        names = [m.column for m in list(self.axes) + list(self.columns)]
        if len(set(names)) != len(names):
            raise ValueError(f"Duplicate output field names: {names}.")
