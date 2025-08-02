import polars as pl
import os
from typing import List, Optional, Dict, Mapping, Any 
import msgspec

from ptabler.common import toPolarsType, PType

from .base import GlobalSettings, PStep, TableSpace
from .util import normalize_path

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

    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
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

        file_path = os.path.join(global_settings.root_folder, normalize_path(self.file))
        lazy_frame = self._do_scan(file_path, scan_kwargs)
        
        updated_table_space = table_space.copy()
        updated_table_space[self.name] = lazy_frame
        
        return updated_table_space, []

class ReadCsv(BaseReadLogic, tag="read_csv"):
    """
    PStep to read data from a CSV file into the tablespace.
    Corresponds to the ReadCsvStep in the TypeScript definitions.
    """
    file: str  # Path to the CSV file
    name: str  # Name to assign to the loaded DataFrame in the tablespace

    delimiter: Optional[str] = None
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

    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
        """
        Common execution logic for writing steps.
        Retrieves the table, selects columns if specified, and then calls _do_sink.
        The actual write operation occurs when the returned LazyFrame (representing 
        the sink status) is collected by the main execution engine.
        """
        if self.table not in table_space:
            raise ValueError(
                f"Table '{self.table}' not found in tablespace. "
                f"Available tables: {list(table_space.keys())}"
            )

        lf_to_write = table_space[self.table]

        selected_lf = lf_to_write
        if self.columns:
            selected_lf = lf_to_write.select(self.columns)
        
        sink_plan = self._do_sink(selected_lf, os.path.join(global_settings.root_folder, normalize_path(self.file)))

        # The tablespace itself is not modified by a write operation.
        # We return the original tablespace and the plan that includes the sink operation.
        return table_space, [sink_plan]

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
