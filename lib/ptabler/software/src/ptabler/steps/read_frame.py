from typing import List, Optional

import polars as pl
import polars_pf as ppf
from polars._typing import ParallelStrategy
from polars_pf import CreateTableRequest

from .base import PStep, StepContext
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
    parallel: ParallelStrategy = "auto",
    """Parallel strategy to use for the read"""
    low_memory: bool = False,
    """Whether to use low memory mode for the read"""
    schema: Optional[List[ColumnSchema]] = None
    """Schema to use for the table, will be applied as a series of cast expressions"""
    n_rows: Optional[int] = None
    """Number of rows to read"""

    def execute(self, ctx: StepContext) -> None:
        lf: pl.LazyFrame = ppf.pframe_source(
            self.directory,
            self.request,
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
