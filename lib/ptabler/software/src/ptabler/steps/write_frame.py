from dataclasses import dataclass
from typing import Callable, Dict, Iterator, List, Literal, Optional, Protocol, Tuple
import hashlib
import os

from msgspec import Struct
import msgspec.json
import polars as pl
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

from .base import PStep, StepContext
from ..common import toPolarsType


# Each ParquetWriter.write_batch call flushes one row group, so this is
# both the per-batch read size and the per-row-group write size.
ROW_GROUP_SIZE = 122880

# Bloom-filter false-positive probability. Sizes the per-(row_group, column)
# bloom along with `ndv = ROW_GROUP_SIZE`.
BLOOM_FILTER_FPP = 0.05

# Per-page byte limits. Smaller pages → finer-grained sub-row-group pruning
# from the page index (the read-side payoff for `write_page_index=True`).
DATA_PAGE_SIZE = 256 * 1024
DICTIONARY_PAGE_SIZE_LIMIT = 256 * 1024


type AxisType = Literal["Int", "Long", "String"]
type ColumnType = Literal["Int", "Long", "Float", "Double", "String"]


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


class Hasher(Protocol):
    """Subset of the hashlib hash interface this module uses."""

    def update(self, data: bytes | memoryview, /) -> None: ...
    def hexdigest(self) -> str: ...


def make_byte_counter(arr_type: pa.DataType) -> Callable[[pa.Array], int]:
    """Return a function that reports the total bytes of non-null values
    in an Arrow array of `arr_type` (UTF-8 byte length for strings,
    fixed-width × non-null count for numerics).
    """
    if pa.types.is_string(arr_type) or pa.types.is_binary(arr_type):
        return lambda arr: arr.view(pa.binary()).total_values_length
    bytes_per_value = arr_type.bit_width // 8
    return lambda arr: (len(arr) - arr.null_count) * bytes_per_value


def hash_string_array(hasher: Hasher, arr: pa.Array) -> None:
    """Feed an Arrow (large_)string array's concatenated values straight
    into `hasher` from the underlying values buffer — no Python str
    materialization, no per-row `encode()`.
    """
    if isinstance(arr, pa.ChunkedArray):
        arr = arr.combine_chunks()
    if len(arr) == 0:
        return
    binary_type = (
        pa.large_binary() if pa.types.is_large_string(arr.type) else pa.binary()
    )
    arr = arr.view(binary_type)
    if arr.offset != 0:
        raise RuntimeError("Unexpected sliced Arrow array from polars")
    values_buf = arr.buffers()[2]
    if values_buf is None:
        return
    hasher.update(memoryview(values_buf)[: arr.total_values_length])


def hash_batch_columns(
    batch_df: pl.DataFrame,
    axes_hasher: Hasher,
    column_hashers: Dict[str, Hasher],
    axes_info: List[DataInfoAxis],
    value_column_names: List[str],
) -> None:
    """Compute per-row sha2_256 for the axes-concat and every value column
    in one polars `.select(...)`, then feed each result column into the
    corresponding hasher.
    """
    axes_expr = (
        pl.concat_str([a.id for a in axes_info], separator="~")
        .cast(pl.String)
        .chash.sha2_256()
        .fill_null("|~|")
    )
    value_exprs = [
        pl.col(name).cast(pl.String).chash.sha2_256().fill_null("|~|").alias(name)
        for name in value_column_names
    ]
    result_df = batch_df.select([axes_expr, *value_exprs])
    hash_string_array(axes_hasher, result_df.to_series(0).to_arrow())
    for i, name in enumerate(value_column_names, start=1):
        hash_string_array(column_hashers[name], result_df.to_series(i).to_arrow())


def _raise_adjacent_duplicate(
    batch: pa.RecordBatch, same_mask: pa.Array, all_axis_names: List[str]
) -> None:
    """Raise ValueError naming the first duplicate row's full axis key.

    `same_mask` is a length-(n-1) boolean array where True at position i
    means rows i and i+1 share the same axis key. `all_axis_names` must
    be every axis (partition + non-partition, in declared order) — the
    full key is what uniquely identifies a row, so anything less would
    leave the user unable to locate the offending entry in their data.
    """
    second_dup_idx = pc.indices_nonzero(same_mask).to_pylist()[0] + 1
    dup_key = [batch.column(name)[second_dup_idx].as_py() for name in all_axis_names]
    raise ValueError(
        f"Multiple rows with the same axis key: {dup_key} detected. "
        "Consider aggregation or adding another axis."
    )


def pairwise_eq(batch: pa.RecordBatch, axis_names: List[str]) -> pa.Array:
    """AND-reduced pairwise equality (row i vs row i+1) across the named
    axis columns. Returns a boolean array of length n-1. `axis_names`
    must be non-empty; callers handle the no-axes case directly (it
    bypasses the comparison entirely).
    """
    n = batch.num_rows
    first_col = batch.column(axis_names[0])
    result = pc.equal(first_col.slice(0, n - 1), first_col.slice(1, n - 1))
    for name in axis_names[1:]:
        col = batch.column(name)
        result = pc.and_(result, pc.equal(col.slice(0, n - 1), col.slice(1, n - 1)))
    return result


def split_batch_and_check_duplicates(
    batch: pa.RecordBatch,
    partition_key_names: List[str],
    non_partition_axis_names: List[str],
) -> Iterator[Tuple[tuple, pa.RecordBatch]]:
    """Yield (partition_key, sub_batch) for each contiguous run of
    identical partition-key values in `batch`. `sub_batch` no longer
    carries the partition-key columns — their values are already in
    `partition_key_tuple` and would be redundant in the per-partition
    output.
    """
    n = batch.num_rows
    if n == 0:
        return

    # All yields project the partition-key columns away: their values are
    # carried in `key`, and the writer's output schema doesn't include
    # them. `drop_columns` is a zero-copy schema rewrite in pyarrow.
    output_batch = (
        batch.drop_columns(partition_key_names) if partition_key_names else batch
    )

    if n == 1:
        key = tuple(batch.column(name)[0].as_py() for name in partition_key_names)
        yield key, output_batch
        return

    # `non_partition_axis_names` is non-empty (validated in WriteFrame.execute).
    same_remaining_axes = pairwise_eq(batch, non_partition_axis_names)

    if not partition_key_names:
        # No partitioning: a duplicate is just two adjacent rows whose
        # non-partition axes all match.
        if pc.any(same_remaining_axes).as_py():
            _raise_adjacent_duplicate(
                batch, same_remaining_axes, non_partition_axis_names
            )
        yield (), output_batch
        return

    same_partition_keys = pairwise_eq(batch, partition_key_names)
    # Adjacent duplicate ⇔ both partition keys and remaining axes match.
    same_all = pc.and_(same_partition_keys, same_remaining_axes)
    if pc.any(same_all).as_py():
        _raise_adjacent_duplicate(
            batch, same_all, partition_key_names + non_partition_axis_names
        )

    # Fast path: batch lies entirely within one partition.
    if pc.all(same_partition_keys).as_py():
        key = tuple(batch.column(name)[0].as_py() for name in partition_key_names)
        yield key, output_batch
        return

    # General path: pull only the boundary indices (positions where the
    # partition key differs between consecutive rows). Typically much
    # smaller than the full n-1 mask materialized as a Python list.
    boundary_indices = pc.indices_nonzero(pc.invert(same_partition_keys)).to_pylist()
    key_cols = [batch.column(name) for name in partition_key_names]
    start = 0
    for i in boundary_indices:
        end = i + 1
        yield (
            tuple(c[start].as_py() for c in key_cols),
            output_batch.slice(start, end - start),
        )
        start = end
    yield (
        tuple(c[start].as_py() for c in key_cols),
        output_batch.slice(start, n - start),
    )


def build_output_schema_and_casts(
    input_schema: pa.Schema,
    output_column_names: List[str],
) -> Tuple[pa.Schema, Dict[str, pa.DataType]]:
    """Build the output Arrow schema by downcasting LargeString/LargeBinary
    to their small variants. Downstream consumers and tests pin the
    String/Binary types.

    Returns (output_schema, cast_targets). `cast_targets` carries entries
    only for columns whose input type differs from the target, so the
    writer can skip `cast()` calls on numeric columns that are already
    in the right type.
    """

    def downcast(field: pa.Field) -> pa.Field:
        if pa.types.is_large_string(field.type):
            return pa.field(
                field.name,
                pa.string(),
                nullable=field.nullable,
                metadata=field.metadata,
            )
        if pa.types.is_large_binary(field.type):
            return pa.field(
                field.name,
                pa.binary(),
                nullable=field.nullable,
                metadata=field.metadata,
            )
        return field

    output_schema = pa.schema(
        [downcast(input_schema.field(n)) for n in output_column_names]
    )
    cast_targets: Dict[str, pa.DataType] = {}
    for name in output_column_names:
        src = input_schema.field(name).type
        dst = output_schema.field(name).type
        if src != dst:
            cast_targets[name] = dst
    return output_schema, cast_targets


def check_axis_nulls_strict(intermediate_parquet: str, axes: List[AxisMapping]) -> None:
    """Sum `null_count` across row groups for each axis (from parquet
    column-chunk stats) and raise on the first axis with any nulls.
    """
    md = pq.read_metadata(intermediate_parquet)
    col_idx_by_name = {md.schema.column(i).name: i for i in range(md.num_columns)}
    for axis in axes:
        col_idx = col_idx_by_name[axis.column]
        null_count = sum(
            md.row_group(rg).column(col_idx).statistics.null_count
            for rg in range(md.num_row_groups)
        )
        if null_count > 0:
            raise ValueError(f"Found {null_count} null values in axis '{axis.column}'.")


@dataclass(frozen=True, kw_only=True)
class PartitionContext:
    """Per-frame setup shared across all partition writers and the streaming
    loop. Build via `PartitionContext.build(...)`.
    """

    frame_dir: str
    partition_key_length: int
    axes_info: List[DataInfoAxis]
    columns_info: Dict[str, DataInfoColumn]
    partition_axis_names: List[str]
    output_axis_names: List[str]
    value_column_names: List[str]
    output_column_names: List[str]
    all_axis_names: List[str]
    output_schema_arrow: pa.Schema
    column_byte_counters: Dict[str, Callable[[pa.Array], int]]
    column_cast_targets: Dict[str, pa.DataType]
    bloom_filter_options: Dict[str, Dict[str, float]]
    sorting_columns: List[pq.SortingColumn]

    @classmethod
    def build(
        self,
        axes: List[AxisMapping],
        columns: List[ColumnMapping],
        partition_key_length: int,
        intermediate_parquet: str,
    ) -> "PartitionContext":
        non_partitioned_axes = axes[partition_key_length:]
        partition_axis_names = [a.column for a in axes[:partition_key_length]]
        output_axis_names = [a.column for a in non_partitioned_axes]
        value_column_names = [c.column for c in columns]
        output_column_names = output_axis_names + value_column_names
        all_axis_names = partition_axis_names + output_axis_names

        input_schema = pq.ParquetFile(intermediate_parquet).schema_arrow
        output_schema, cast_targets = build_output_schema_and_casts(
            input_schema, output_column_names
        )

        return self(
            frame_dir=os.path.dirname(intermediate_parquet),
            partition_key_length=partition_key_length,
            axes_info=[
                DataInfoAxis(id=a.column, type=a.type) for a in non_partitioned_axes
            ],
            columns_info={
                c.column: DataInfoColumn(id=c.column, type=c.type) for c in columns
            },
            partition_axis_names=partition_axis_names,
            output_axis_names=output_axis_names,
            value_column_names=value_column_names,
            output_column_names=output_column_names,
            all_axis_names=all_axis_names,
            output_schema_arrow=output_schema,
            column_byte_counters={
                name: make_byte_counter(output_schema.field(name).type)
                for name in output_column_names
            },
            column_cast_targets=cast_targets,
            bloom_filter_options={
                name: {"ndv": ROW_GROUP_SIZE, "fpp": BLOOM_FILTER_FPP}
                for name in output_column_names
            },
            sorting_columns=[
                pq.SortingColumn(
                    output_column_names.index(name), descending=False, nulls_first=True
                )
                for name in output_axis_names
            ],
        )


class PartitionWriter:
    """Streams sub-batches of one partition to a parquet file while
    accumulating row count, per-column byte sizes, and per-column digests.
    `close_and_finalize()` returns one DataInfoPart per value column.

    Writer settings:
      * `write_page_index=True` — column + offset index so DataFusion's
        HashJoin DynamicFilter pushdown can prune at sub-row-group
        granularity on the right side of a left join.
      * Bloom filter on every column (axes AND value columns) — the UI
        issues exact-match lookups on value columns too. Bloom is
        per-(row_group, column); `ndv = ROW_GROUP_SIZE` is the tight
        upper bound on per-row-group distinct values.
      * `sorting_columns` per row group so readers don't infer the sort.
        Polars sorts with `nulls_last=False` upstream, so `nulls_first=True`
        here; axis columns carry no nulls by this point (strict-mode
        raises, lenient-mode filters), so the field is metadata-only.
      * DataPage v2 — v1 colocates definition/repetition levels with
        values, tuned for sequential scans; our pattern includes point
        reads of a single page out of a chunk.
    """

    _ctx: PartitionContext
    key_tuple: tuple
    path: str
    _data_file: str
    _part_key: str
    _writer: Optional[pq.ParquetWriter]
    _axes_hasher: Hasher
    _column_hashers: Dict[str, Hasher]
    _column_bytes: Dict[str, int]
    _nrows: int

    def __init__(self, ctx: PartitionContext, partition_index: int, key_tuple: tuple):
        self._ctx = ctx
        self.key_tuple = key_tuple
        self._data_file = f"partition_{partition_index}.parquet"
        self._part_key = msgspec.json.encode(list(key_tuple)).decode()
        self.path = os.path.join(ctx.frame_dir, self._data_file)

        self._writer = pq.ParquetWriter(
            self.path,
            ctx.output_schema_arrow,
            compression="zstd",
            compression_level=3,
            use_dictionary=True,
            write_statistics=True,
            write_page_index=True,
            write_page_checksum=True,
            dictionary_pagesize_limit=DICTIONARY_PAGE_SIZE_LIMIT,
            data_page_size=DATA_PAGE_SIZE,
            bloom_filter_options=ctx.bloom_filter_options,
            sorting_columns=ctx.sorting_columns,
            version="2.6",
            data_page_version="2.0",
        )

        # Hashers seeded with column types so two writes of the same values
        # under different schemas produce different digests.
        self._axes_hasher = hashlib.sha256(
            "~".join([a.type for a in ctx.axes_info]).encode()
        )
        self._column_hashers = {
            name: hashlib.sha256(ctx.columns_info[name].type.encode())
            for name in ctx.value_column_names
        }
        self._column_bytes = {name: 0 for name in ctx.output_column_names}
        self._nrows = 0

    def write(self, sub_batch: pa.RecordBatch) -> None:
        ctx = self._ctx
        output_batch = pa.RecordBatch.from_arrays(
            [
                sub_batch.column(name).cast(ctx.column_cast_targets[name])
                if name in ctx.column_cast_targets
                else sub_batch.column(name)
                for name in ctx.output_column_names
            ],
            schema=ctx.output_schema_arrow,
        )
        self._writer.write_batch(output_batch)
        self._nrows += output_batch.num_rows
        for name in ctx.output_column_names:
            self._column_bytes[name] += ctx.column_byte_counters[name](
                output_batch.column(name)
            )
        hash_batch_columns(
            pl.from_arrow(output_batch),
            self._axes_hasher,
            self._column_hashers,
            ctx.axes_info,
            ctx.value_column_names,
        )

    def close_and_finalize(self) -> Tuple[str, Dict[str, DataInfoPart]]:
        """Close the parquet writer and build one DataInfoPart per value
        column. Returns (part_key, column_parts) so the caller can insert into
        its per-column DataInfo.parts dict.
        """
        ctx = self._ctx
        self._writer.close()
        self._writer = None
        axes_hash = self._axes_hasher.hexdigest()
        axes_nbytes = [self._column_bytes[a.id] for a in ctx.axes_info]
        parts: Dict[str, DataInfoPart] = {}
        for name in ctx.value_column_names:
            column_hash = self._column_hashers[name].hexdigest()
            data_digest = hashlib.sha256(
                f"{axes_hash}{column_hash}".encode()
            ).hexdigest()
            parts[name] = DataInfoPart(
                data=self._data_file,
                axes=ctx.axes_info,
                column=ctx.columns_info[name],
                data_digest=data_digest,
                stats=Stats(
                    number_of_rows=self._nrows,
                    number_of_bytes=NumberOfBytes(
                        axes=axes_nbytes,
                        column=self._column_bytes[name],
                    ),
                ),
            )
        return self._part_key, parts

    def abort(self) -> None:
        """Best-effort cleanup after a mid-write exception. Swallows
        errors from close()/unlink() so the original exception surfaces.

        Early-returns when the writer has already been finalized: a
        successful `close_and_finalize` sets `_writer = None`, and we
        must never delete a partition file that's already committed.
        """
        if self._writer is None:
            return
        try:
            self._writer.close()
        except Exception:
            pass
        self._writer = None
        if os.path.exists(self.path):
            try:
                os.unlink(self.path)
            except Exception:
                pass


class PartitionDispatcher:
    """Routes sub-batches to the right PartitionWriter, opening a new
    writer on partition-key change and merging the just-closed writer's
    DataInfoParts into the per-column DataInfo accumulator.

    Call `dispatch(key_tuple, sub_batch)` for each sub-batch; `close()`
    when the input is exhausted; `abort()` from a finally clause to
    clean up after an exception.
    """

    _ctx: PartitionContext
    _current: Optional[PartitionWriter]
    _partition_index: int
    data_info_by_column: Dict[str, DataInfo]

    def __init__(self, ctx: PartitionContext):
        self._ctx = ctx
        self._current = None
        self._partition_index = 0
        self.data_info_by_column = {
            name: DataInfo(partition_key_length=ctx.partition_key_length, parts={})
            for name in ctx.value_column_names
        }

    def dispatch(self, key_tuple: tuple, sub_batch: pa.RecordBatch) -> None:
        if self._current is None or self._current.key_tuple != key_tuple:
            self._close_current()
            self._current = PartitionWriter(self._ctx, self._partition_index, key_tuple)
            self._partition_index += 1
        self._current.write(sub_batch)

    def close(self) -> None:
        """Finalize the last open partition, if any."""
        self._close_current()

    def abort(self) -> None:
        """Best-effort cleanup of an in-progress writer. No-op if `close()`
        already ran.
        """
        if self._current is not None:
            self._current.abort()
            self._current = None

    def _close_current(self) -> None:
        if self._current is None:
            return
        # Clear `_current` before finalizing so a mid-finalize exception
        # can't leak a stale reference: `abort()` becomes a no-op (the
        # writer's own `abort` will also no-op since its `_writer` was
        # set to None on a successful close).
        current = self._current
        self._current = None
        part_key, parts = current.close_and_finalize()
        for column_name, part in parts.items():
            self.data_info_by_column[column_name].parts[part_key] = part


class AdjacentDuplicateDetector:
    """Watches a stream of sorted batches for adjacent rows with identical
    full axis tuples. Tracks the prior batch's last row so duplicates
    straddling a batch boundary are caught.

    Within-batch duplicates are handled by `split_batch_and_check_duplicates`
    (the work overlaps with partition splitting); this class only covers
    the cross-batch case.
    """

    _all_axis_names: List[str]
    _prev_axis_row: Optional[tuple]

    def __init__(self, all_axis_names: List[str]):
        self._all_axis_names = all_axis_names
        self._prev_axis_row = None

    def check(self, batch: pa.RecordBatch) -> None:
        """Raise ValueError if `batch`'s first row duplicates the prior
        batch's last row. Records this batch's last row for the next call.
        """
        if batch.num_rows == 0:
            return
        if self._prev_axis_row is not None:
            first = tuple(batch.column(n)[0].as_py() for n in self._all_axis_names)
            if first == self._prev_axis_row:
                raise ValueError(
                    f"Multiple rows with the same axis key: {list(first)} detected. "
                    "Consider aggregation or adding another axis."
                )
        self._prev_axis_row = tuple(
            batch.column(n)[batch.num_rows - 1].as_py() for n in self._all_axis_names
        )


class WriteFrame(PStep, tag="write_frame"):
    """PStep that materializes a polars LazyFrame into a partitioned
    PFrame on disk. Corresponds to the WriteFrameStep TypeScript type.
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

        # Cast → (optional) null-row drop → sort → sink. Polars' streaming
        # engine handles the sort out-of-core; downstream code reads the
        # intermediate back via pyarrow.iter_batches (also streaming).
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
        lf = lf.sort([a.column for a in self.axes], nulls_last=False)

        intermediate_parquet = os.path.join(frame_dir, "intermediate.parquet")
        lf = lf.sink_parquet(path=intermediate_parquet, lazy=True)
        ctx.add_sink(lf)
        ctx.chain_task(lambda: self._write_partitions(intermediate_parquet))

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

    def _write_partitions(self, intermediate_parquet: str) -> None:
        """Single streaming pass over the sorted intermediate parquet.
        Partitions are contiguous runs in the file; PartitionDispatcher
        keeps one ParquetWriter open at a time and rotates it on
        partition-key change. Row counts, per-column byte sizes, hashes,
        and duplicate-key detection are folded into the same loop.
        """
        if self.strict:
            check_axis_nulls_strict(intermediate_parquet, self.axes)

        ctx = PartitionContext.build(
            self.axes, self.columns, self.partition_key_length, intermediate_parquet
        )
        dispatcher = PartitionDispatcher(ctx)
        duplicate_detector = AdjacentDuplicateDetector(ctx.all_axis_names)

        try:
            pf = pq.ParquetFile(intermediate_parquet)
            for batch in pf.iter_batches(batch_size=ROW_GROUP_SIZE):
                if batch.num_rows == 0:
                    continue
                duplicate_detector.check(batch)
                for key_tuple, sub_batch in split_batch_and_check_duplicates(
                    batch,
                    ctx.partition_axis_names,
                    ctx.output_axis_names,
                ):
                    dispatcher.dispatch(key_tuple, sub_batch)
            dispatcher.close()

            for column_name, data_info in dispatcher.data_info_by_column.items():
                with open(
                    os.path.join(ctx.frame_dir, f"{column_name}.datainfo"), "wb"
                ) as f:
                    f.write(msgspec.json.encode(data_info))

        finally:
            dispatcher.abort()
            if os.path.exists(intermediate_parquet):
                os.remove(intermediate_parquet)
