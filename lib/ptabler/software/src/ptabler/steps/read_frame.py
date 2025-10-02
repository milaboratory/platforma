from typing import List, Optional
import os

import polars as pl
import polars_pf as ppf
from polars._typing import ParallelStrategy
from polars_pf import CreateTableRequest

from .base import PStep, StepContext
from .util import normalize_path
from ptabler.steps.io import ColumnSchema
from ptabler.common import toPolarsType

class ReadFrame(PStep, tag="read_frame"):
    """
    PStep to create a lazy table from provided PFrame.

    Corresponds to the ReadFrameStep defined in the TypeScript type definitions.
    """
    directory: str
    """Path to the PFrame directory"""
    name: str
    """Name to assign to the loaded DataFrame in the tablespace"""
    request: CreateTableRequest
    """Request to create the table"""
    spill_path: Optional[str] = None,
    """Spill path for PFrames, OS /tmp by default"""
    parallel: ParallelStrategy = "auto",
    """Parallel strategy to use for the read"""
    low_memory: bool = False,
    """Whether to use low memory mode for the read"""
    schema: Optional[List[ColumnSchema]] = None
    """Schema to use for the table, will be applied as a series of cast expressions"""
    n_rows: Optional[int] = None
    """Number of rows to read"""

    def execute(self, ctx: StepContext) -> None:
        if not self.directory or not self.directory.strip():
            raise ValueError("The 'directory' cannot be empty.")
        if self.directory != os.path.basename(self.directory):
            raise ValueError("The 'directory' must be a directory name, not a path.")
        
        directory_path = os.path.join(ctx.settings.root_folder, self.directory)
        if not os.path.isdir(directory_path):
            raise ValueError(f"The 'directory' is not an existing directory: {directory_path}")

        if self.spill_path is not None:
            if self.spill_path != os.path.basename(self.spill_path):
                raise ValueError("The 'spill_path' must be a directory name, not a path.")
            spill_path = os.path.join(ctx.settings.root_folder, normalize_path(self.spill_path))
            os.makedirs(spill_path, exist_ok=True)
        
        lf: pl.LazyFrame = ppf.pframe_source(
            directory_path,
            self.request,
            #logger=ppf.logger,
            spill_path=spill_path,
            parallel=self.parallel,
            low_memory=self.low_memory,
        )

        if self.schema:
            columns: list[pl.Expr] = []
            for col_spec in self.schema:
                col_expr: pl.Expr = pl.col(col_spec.column)
                if col_spec.null_value is not None:
                    col_expr = pl.when(
                        col_expr.cast(pl.String).eq(col_spec.null_value)
                    ).then(pl.lit(None)).otherwise(col_expr)
                if col_spec.type:
                    col_expr = col_expr.cast(toPolarsType(col_spec.type))
                columns.append(col_expr)
            lf = lf.select(columns)
        
        if self.n_rows is not None:
            lf = lf.limit(self.n_rows)
        
        ctx.put_table(self.name, lf)
