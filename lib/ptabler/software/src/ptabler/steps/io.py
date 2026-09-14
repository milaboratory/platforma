import polars as pl
import os
import stat
import tempfile
from typing import List, Optional, Dict, Any
import msgspec

from ptabler.common import toPolarsType, PType

from .base import PStep, StepContext
from .util import physical_file, step_file_identity, step_file_path

class ColumnSchema(msgspec.Struct, frozen=True, omit_defaults=True):
    """Defines the schema for a single column, mirroring the TS definition."""
    column: str
    type: Optional[PType] = None
    null_value: Optional[str] = None # Specific string to be interpreted as null for this column

class BaseReadLogic(PStep):
    """
    Abstract base class for PSteps that read files into the tablespace.
    It handles common logic like schema processing, null values, and table space updates.
    Concrete subclasses must implement the _do_scan method.
    """
    # These attributes are expected to be defined by subclasses that are msgspec.Structs
    # and PStep compliant.
    file: str
    name: str
    schema: Optional[List[ColumnSchema]]
    infer_schema: Optional[bool]
    ignore_errors: Optional[bool]
    n_rows: Optional[int]

    def _do_scan(self, file_path: str, scan_kwargs: Dict[str, Any]) -> pl.LazyFrame:
        """
        Performs the specific scan operation for the derived class.
        This method should return a Polars LazyFrame from the file.
        """
        pass

    def execute(self, ctx: StepContext):
        """
        Common execution logic for reading steps.
        Processes schema, builds scan kwargs, calls _do_scan, and updates table space.
        """
        scan_kwargs: Dict[str, Any] = {}

        defined_column_types: Dict[str, pl.DataType] = {}
        defined_null_values: Dict[str, str] = {}

        if self.schema:
            for col_spec in self.schema:
                if col_spec.type:
                    polars_type_obj = toPolarsType(col_spec.type)
                    defined_column_types[col_spec.column] = polars_type_obj
                
                if col_spec.null_value is not None:
                    defined_null_values[col_spec.column] = col_spec.null_value

        if defined_column_types:
            scan_kwargs["schema_overrides"] = defined_column_types
        
        if defined_null_values:
            scan_kwargs["null_values"] = defined_null_values
        
        if self.n_rows is not None:
            scan_kwargs["n_rows"] = self.n_rows

        if self.infer_schema is not None:
            scan_kwargs["infer_schema"] = self.infer_schema

        if self.ignore_errors is not None:
            scan_kwargs["ignore_errors"] = self.ignore_errors

        file_path = step_file_path(ctx.settings.root_folder, self.file)
        lazy_frame = self._do_scan(file_path, scan_kwargs)
        
        ctx.put_table(self.name, lazy_frame)

class ReadCsv(BaseReadLogic, tag="read_csv"):
    """
    PStep to read data from a CSV file into the tablespace.
    Corresponds to the ReadCsvStep in the TypeScript definitions.
    """
    file: str  # Path to the CSV file
    name: str  # Name to assign to the loaded DataFrame in the tablespace

    delimiter: Optional[str] = None
    comment_prefix: Optional[str] = None

    schema: Optional[List[ColumnSchema]] = None
    infer_schema: Optional[bool] = None
    ignore_errors: Optional[bool] = None
    n_rows: Optional[int] = None

    def _do_scan(self, file_path: str, scan_kwargs: Dict[str, Any]) -> pl.LazyFrame:
        """
        Prepares a Polars scan plan to read the CSV file.
        """
        if self.delimiter is not None:
            scan_kwargs["separator"] = self.delimiter
        if self.comment_prefix is not None:
            scan_kwargs["comment_prefix"] = self.comment_prefix
    
        return pl.scan_csv(file_path, **scan_kwargs)

class ReadNdjson(BaseReadLogic, tag="read_ndjson"):
    """
    PStep to read data from an NDJSON file into the tablespace.
    Corresponds to the ReadNdjsonStep in the TypeScript definitions.
    """
    file: str  # Path to the NDJSON file
    name: str  # Name to assign to the loaded DataFrame in the tablespace

    schema: Optional[List[ColumnSchema]] = None
    infer_schema: Optional[bool] = None
    ignore_errors: Optional[bool] = None
    n_rows: Optional[int] = None

    def _do_scan(self, file_path: str, scan_kwargs: Dict[str, Any]) -> pl.LazyFrame:
        """
        Prepares a Polars scan plan to read the NDJSON file.
        """
        return pl.scan_ndjson(file_path, **scan_kwargs)

class ReadParquet(BaseReadLogic, tag="read_parquet"):
    """
    PStep to read data from an Apache Parquet file into the tablespace.
    Corresponds to the ReadParquetStep in the TypeScript definitions.
    """
    file: str  # Path to the Parquet file
    name: str  # Name to assign to the loaded DataFrame in the tablespace

    schema: Optional[List[ColumnSchema]] = None
    infer_schema: Optional[bool] = None
    ignore_errors: Optional[bool] = None
    n_rows: Optional[int] = None

    def _do_scan(self, file_path: str, scan_kwargs: Dict[str, Any]) -> pl.LazyFrame:
        """
        Prepares a Polars scan plan to read the Apache Parquet file.
        """
        return pl.scan_parquet(file_path, **scan_kwargs)

PARTIAL_SUFFIX = ".ptabler-partial"


def _create_partial_output(file_path: str) -> str:
    """
    Creates the file a rewrite sinks into, already carrying the mode its target will need.

    The name is unique. Two steps rewriting one target never share a partial file, and
    neither can land on a name the workflow's own data uses.

    The mode is set here rather than at the move, because the sink starts writing as
    soon as it is collected. Take a target restricted to 0o600. A partial file created
    under the umask would be readable by anyone holding the workspace, for as long as the
    write takes. mkstemp opens at 0o600, so that window never exists, and the target's
    own mode is applied before any row is written.
    """
    directory, name = os.path.split(file_path)
    handle, temp_path = tempfile.mkstemp(
        dir=directory or ".", prefix=f".{name}.", suffix=PARTIAL_SUFFIX
    )
    os.close(handle)

    target_mode = _target_mode(file_path)
    if target_mode is not None:
        os.chmod(temp_path, target_mode)

    return temp_path


def _target_mode(file_path: str) -> Optional[int]:
    """Returns the mode of an existing target, or None when the write creates it."""
    try:
        return stat.S_IMODE(os.stat(file_path).st_mode)
    except FileNotFoundError:
        return None


def _target_refuses_writes(file_path: str) -> bool:
    """
    Reports whether an existing target would reject a write through its own mode.

    Only a rewrite has to ask. A write that goes straight to its file finds out from the
    filesystem. A rewrite writes somewhere else first and would then move the result on
    top, past a mode that was the whole point.

    The backend hands a block its workdir files read-only unless the workflow asked for
    a writable copy. A path that does not exist yet refuses nothing — the write creates it.
    """
    return os.path.exists(file_path) and not os.access(file_path, os.W_OK)


def _replace_preserving_mode(temp_path: str, file_path: str) -> None:
    """
    Moves a finished rewrite onto its target path, keeping the mode the target had.

    os.replace swaps in a new inode, so the target would otherwise come back with the
    partial file's mode. A workdir file the backend staged writable at 0o600 has that
    mode for a reason. A block that writes it must not hand back something read-only.

    The partial file was created carrying this mode already, and polars truncates rather
    than recreates it, so this re-applies what is usually the same mode. It is here for
    the case where that stops holding.
    """
    target_mode = _target_mode(file_path)
    if target_mode is not None:
        os.chmod(temp_path, target_mode)

    os.replace(temp_path, file_path)


class BaseWriteLogic(PStep):
    """
    Abstract base class for PSteps that write tables to files.
    It handles common logic like table retrieval from tablespace and column selection.
    Concrete subclasses must implement the _do_sink method.
    """
    # These attributes are expected to be defined by subclasses that are msgspec.Structs
    # and PStep compliant.
    table: str
    file: str
    columns: Optional[List[str]]

    def _do_sink(self, selected_lf: pl.LazyFrame, output_path: str) -> pl.LazyFrame:
        """
        Performs the specific sink operation for the derived class.
        This method should prepare and return a Polars LazyFrame representing the sink plan.
        """
        pass

    def execute(self, ctx: StepContext):
        """
        Common execution logic for writing steps.
        Retrieves the table, selects columns if specified, and then calls _do_sink.
        The actual write operation occurs when the returned LazyFrame (representing 
        the sink status) is collected by the main execution engine.

        A write whose file the same workflow also reads is a rewrite and takes the longer
        route in _sink_rewrite. Every other write sinks straight to its file.
        """
        lf_to_write = ctx.get_table(self.table)

        selected_lf = lf_to_write
        if self.columns:
            selected_lf = lf_to_write.select(self.columns)
        
        file_path = step_file_path(ctx.settings.root_folder, self.file)
        identity = step_file_identity(ctx.settings.root_folder, self.file)

        if identity in ctx.overwrite_targets:
            self._sink_rewrite(ctx, selected_lf, file_path)
        else:
            ctx.add_sink(self._do_sink(selected_lf, file_path))

    def _sink_rewrite(self, ctx: StepContext, selected_lf: pl.LazyFrame, file_path: str):
        """
        Sinks a write whose file the same workflow also reads.

        The sink cannot go to file_path. The read is lazy and still open, so truncating
        the file there takes the data out from under polars mid-read. A local filesystem
        survives that on cached pages. A network filesystem does not, and the process
        ends on SIGBUS.

        The rows go to a sibling partial file instead. The move onto the target is
        chained behind collect_all, by which point every read has finished.

        The target is the physical file, not the path as written. os.replace does not
        follow a symlink, so an alias handed straight to it would end up a regular file
        while the rows it stood for never moved.
        """
        target_path = physical_file(file_path)

        if _target_refuses_writes(target_path):
            # A partial file would walk straight past the target's mode, because
            # os.replace asks the directory for permission and never the file. Sink onto
            # the target instead, so the write fails the way the caller expects.
            ctx.add_sink(self._do_sink(selected_lf, target_path))
            return

        temp_path = _create_partial_output(target_path)

        ctx.add_sink(self._do_sink(selected_lf, temp_path))
        ctx.add_partial_output(temp_path)
        ctx.chain_task(lambda: _replace_preserving_mode(temp_path, target_path))

class WriteCsv(BaseWriteLogic, tag="write_csv"):
    """
    PStep to write a table from the tablespace to a CSV file.
    Corresponds to the WriteCsvStep in the TypeScript definitions.
    """
    table: str  # Name of the table in the tablespace to write
    file: str   # Path to the output CSV file

    columns: Optional[List[str]] = None  # Optional: List of column names to write
    delimiter: Optional[str] = None      # Optional: The delimiter character for the output CSV

    def _do_sink(self, selected_lf: pl.LazyFrame, output_path: str) -> pl.LazyFrame:
        """
        Prepares a Polars plan to write the selected LazyFrame to a CSV file.
        """
        sink_kwargs: Dict[str, Any] = {}
        if self.delimiter is not None:
            sink_kwargs["separator"] = self.delimiter
        
        # Polars' sink_csv method with lazy=True prepares a plan that includes writing the CSV.
        # It returns a DataFrame which, when collected, performs the write
        # and contains status information.
        return selected_lf.sink_csv(
            path=output_path,
            lazy=True, # Ensures a plan is returned
            **sink_kwargs
        )

# Not yet supported, should be a normal write_json, but we don't have a lazy sink_json, can create a workaround
# if needed.
# class WriteJson(BaseWriteLogic, tag="write_json"):
#     """
#     PStep to write a table from the tablespace to a JSON Lines file.
#     Uses Polars' sink_ndjson for lazy writing.
#     (Corresponds to a hypothetical WriteJsonStep in TypeScript definitions).
#     """
#     table: str  # Name of the table in the tablespace to write
#     file: str   # Path to the output JSON file
#     columns: Optional[List[str]] = None  # Optional: List of column names to write

#     def _do_sink(self, selected_lf: pl.LazyFrame, output_path: str) -> pl.LazyFrame:
#         """
#         Prepares a Polars plan to write the selected LazyFrame to a JSON Lines file.
#         """
#         return selected_lf.sink_ndjson(path=output_path, lazy=True)

class WriteNdjson(BaseWriteLogic, tag="write_ndjson"):
    """
    PStep to write a table from the tablespace to an NDJSON file.
    Uses Polars' sink_ndjson for lazy writing.
    Corresponds to the WriteNdjsonStep in TypeScript definitions.
    """
    table: str  # Name of the table in the tablespace to write
    file: str   # Path to the output NDJSON file
    columns: Optional[List[str]] = None  # Optional: List of column names to write

    def _do_sink(self, selected_lf: pl.LazyFrame, output_path: str) -> pl.LazyFrame:
        """
        Prepares a Polars plan to write the selected LazyFrame to an NDJSON file.
        """
        return selected_lf.sink_ndjson(path=output_path, lazy=True)

class WriteParquet(BaseWriteLogic, tag="write_parquet"):
    """
    PStep to write a table from the tablespace to an Apache Parquet file.
    Uses Polars' sink_parquet for lazy writing.
    Corresponds to the WriteParquetStep in TypeScript definitions.
    """
    table: str  # Name of the table in the tablespace to write
    file: str   # Path to the output Parquet file
    columns: Optional[List[str]] = None  # Optional: List of column names to write

    def _do_sink(self, selected_lf: pl.LazyFrame, output_path: str) -> pl.LazyFrame:
        """
        Prepares a Polars plan to write the selected LazyFrame to an Apache Parquet file.
        """
        return selected_lf.sink_parquet(path=output_path, lazy=True)
