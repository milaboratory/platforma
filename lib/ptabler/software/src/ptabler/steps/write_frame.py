"""Materialise a polars LazyFrame into a partitioned PFrame on disk.

The heavy lifting (per-partition parquet writes, bloom filters, page index,
digests, byte counts, `.datainfo` JSON emission) is delegated to the
`polars_pf.convert` extension from pframes-rs, which uses arrow-rs's writer
with `BloomFilterPosition::AfterRowGroup` to keep memory bounded — the
in-memory bloom accumulation in pyarrow's writer is what caused the OOM in
the previous Python-only implementation.

The Python side here owns:
  * spec validation (`frame_name` shape, axis/column counts, dup names,
    `partition_key_length < len(axes)`),
  * the lazy pipeline that produces the intermediate parquet (cast, optional
    null-axis filter for non-strict mode); the sort by axes is done
    out-of-core by DuckDB afterwards, not by Polars (Polars' in-memory sort
    OOMs on wide million-row frames),
  * registering the sink with `StepContext` so the executor flushes it,
  * scheduling the DuckDB sort + `polars_pf.convert` call after the sink completes.

The `DataInfo*` / `Stats` / `NumberOfBytes` Structs below are kept as public
types so legacy ptabler consumers that import them keep working, but
write_frame no longer builds them in Python — `polars_pf.convert` writes
the canonical JSON envelope directly to `<column>.datainfo`.
"""
from typing import Dict, List, Optional
import os

import duckdb
import polars as pl
from msgspec import Struct
from polars_pf import AxisMapping, ColumnMapping, ConversionParams, convert
from polars_pf.json.spec import AxisType, ColumnType

from .base import PStep, StepContext
from ..common import toPolarsType

__all__ = [
    "AxisMapping",
    "AxisType",
    "ColumnMapping",
    "ColumnType",
    "ConversionParams",
    "DataInfo",
    "DataInfoAxis",
    "DataInfoColumn",
    "DataInfoPart",
    "NumberOfBytes",
    "Stats",
    "WriteFrame",
]


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


# Row-group size shared by the DuckDB sort output and convert's read batch size
ROW_GROUP_SIZE = 122_880


def _escape(name: str) -> str:
    """Quote a SQL identifier, doubling any embedded double-quotes."""
    return '"' + name.replace('"', '""') + '"'


class WriteFrame(PStep, tag="write_frame"):
    """PStep that materializes a polars LazyFrame into a partitioned PFrame
    directory. Corresponds to the `WriteFrameStep` TypeScript type.
    """

    input_table: str
    frame_name: str
    axes: List[AxisMapping]
    columns: List[ColumnMapping]
    partition_key_length: int = 0
    strict: bool = False

    def execute(self, ctx: StepContext) -> None:
        self._validate()

        lf = ctx.get_table(self.input_table)
        frame_dir = os.path.join(ctx.settings.root_folder, self.frame_name)
        os.makedirs(frame_dir)

        cast_exprs = [
            pl.col(a.column).cast(toPolarsType(a.type)) for a in self.axes
        ] + [
            pl.col(c.column).cast(toPolarsType(c.type), strict=False)
            for c in self.columns
        ]
        lf = lf.select(cast_exprs)
        if not self.strict:
            lf = lf.filter(
                pl.all_horizontal([pl.col(a.column).is_not_null() for a in self.axes])
            )

        unsorted_parquet = os.path.join(frame_dir, "unsorted.parquet")
        lf = lf.sink_parquet(path=unsorted_parquet, lazy=True)
        ctx.add_sink(lf)
        
        intermediate_parquet = os.path.join(frame_dir, "intermediate.parquet")
        spill_dir = str(ctx.settings.spill_folder or frame_dir)
        ctx.chain_task(
            lambda: self._sort_and_convert(
                unsorted_parquet, intermediate_parquet, frame_dir, spill_dir
            )
        )

    def _validate(self) -> None:
        if not self.frame_name or not self.frame_name.strip():
            raise ValueError("The 'frame_name' cannot be empty.")
        if self.frame_name != os.path.basename(self.frame_name):
            raise ValueError("The 'frame_name' must be a directory name, not a path.")
        if not self.axes:
            raise ValueError("At least one axis must be specified.")
        if not self.columns:
            raise ValueError("At least one column must be specified.")

        axis_columns = [a.column for a in self.axes]
        column_columns = [c.column for c in self.columns]
        if len(set(axis_columns + column_columns)) != len(axis_columns) + len(
            column_columns
        ):
            duplicates = list(set(axis_columns) & set(column_columns))
            raise ValueError(
                f"Column identifiers used in both axes and columns: [{', '.join(duplicates)}]"
            )

        if self.partition_key_length < 0 or self.partition_key_length >= len(self.axes):
            raise ValueError(
                f"The 'partition_key_length' ({self.partition_key_length}) must be "
                f"strictly less than the number of axes ({len(self.axes)})."
            )

    def _sort_and_convert(
        self,
        unsorted_parquet: str,
        intermediate_parquet: str,
        frame_dir: str,
        spill_dir: str,
    ) -> None:
        order_by = ", ".join(f"{_escape(a.column)} ASC NULLS FIRST" for a in self.axes)
        conn = duckdb.connect(database=":memory:")
        try:
            conn.execute("SET temp_directory TO ?;", [spill_dir])
            conn.execute(
                f"""
                COPY (SELECT * FROM read_parquet(?) ORDER BY {order_by})
                TO '{intermediate_parquet}'
                (
                    PRESERVE_ORDER TRUE,
                    FORMAT PARQUET,
                    ROW_GROUP_SIZE {ROW_GROUP_SIZE},
                    COMPRESSION 'UNCOMPRESSED'
                )
                """,
                [unsorted_parquet],
            )
        finally:
            conn.close()
            if os.path.exists(unsorted_parquet):
                os.remove(unsorted_parquet)

        self._convert(intermediate_parquet, frame_dir)

    def _convert(self, intermediate_parquet: str, frame_dir: str) -> None:
        params = ConversionParams(
            frame_dir=frame_dir,
            axes=self.axes,
            columns=self.columns,
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
