from typing import Mapping

import polars as pl
import polars_pf as ppf
from polars._typing import ParallelStrategy
from polars_pf import CreateTableRequest, PTableColumnSpec, PTableColumnSpecAxis

from .base import PStep, StepContext
from ptabler.common import axis_ref

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
        if spec.id in self.translation:
            return self.translation[spec.id]
        return spec.id # sliced columns do not require renaming

    def execute(self, ctx: StepContext) -> None:
        if ctx.settings.frame_folder is None:
            raise ValueError("Frame folder is not set")
        
        result: tuple[pl.LazyFrame, ppf.PFrameCache] = ppf.pframe_source(
            ctx.settings.frame_folder,
            self.request,
            spill_path=ctx.settings.spill_folder,
            # column_ref is a function which takes a PTableColumnSpec and returns a polars column name
            # effectively pframe_source applies select with aliases to names returned by column_ref
            column_ref=self.column_ref,
            logger=ppf.logger,
            parallel=self.parallel,
            low_memory=self.low_memory,
        )
        lf, cache = result
        
        ctx.put_table(self.name, lf)
        ctx.chain_task(lambda: cache.dispose())
