import os
from typing import Mapping

import polars as pl
import polars_pf as ppf
from polars._typing import ParallelStrategy
from polars_pf import axis_ref, CreateTableRequest, PTableColumnSpec, PTableColumnSpecAxis

from .base import PStep, StepContext

class ReadFrame(PStep, tag="read_frame"):
    """
    PStep to create a lazy table from provided PFrame.

    Corresponds to the ReadFrameStep defined in the TypeScript type definitions.
    """
    name: str
    """Name to assign to the loaded DataFrame in the tablespace"""
    request: CreateTableRequest
    """Request to create the table"""
    translation: Mapping[str, str]
    """Translation of PFrame column ids into Polars column names"""
    parallel: ParallelStrategy = "auto"
    """Parallel strategy to use for the read"""
    low_memory: bool = False
    """Whether to use low memory mode for the read"""

    def column_ref(self, spec: PTableColumnSpec) -> str:
        if isinstance(spec, PTableColumnSpecAxis):
            return axis_ref(spec.spec)
        return self.translation[spec.id]

    def execute(self, ctx: StepContext) -> None:
        if not os.path.isdir(ctx.settings.frame_folder):
            raise ValueError(f"Frame folder does not exist: {ctx.settings.frame_folder}")
        
        lf: pl.LazyFrame = ppf.pframe_source(
            ctx.settings.frame_folder,
            self.request,
            spill_path=ctx.settings.spill_folder,
            column_ref=self.column_ref,
            logger=ppf.logger,
            parallel=self.parallel,
            low_memory=self.low_memory,
        )
        
        ctx.put_table(self.name, lf)
