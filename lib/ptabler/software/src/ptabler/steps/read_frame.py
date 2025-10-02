import os

import polars as pl
import polars_pf as ppf
from polars._typing import ParallelStrategy
from polars_pf import CreateTableRequest

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
    parallel: ParallelStrategy = "auto"
    """Parallel strategy to use for the read"""
    low_memory: bool = False
    """Whether to use low memory mode for the read"""

    def execute(self, ctx: StepContext) -> None:
        if not os.path.isdir(ctx.settings.frame_folder):
            raise ValueError(f"Frame folder does not exist: {ctx.settings.frame_folder}")
        
        lf: pl.LazyFrame = ppf.pframe_source(
            ctx.settings.frame_folder,
            self.request,
            logger=ppf.logger,
            spill_path=ctx.settings.spill_folder,
            parallel=self.parallel,
            low_memory=self.low_memory,
        )
        
        ctx.put_table(self.name, lf)
