from typing import List, Optional

from .base import PStep, StepContext
from .io import ColumnSchema

class ReadFrame(PStep, tag="read_frame"):
    """
    PStep to create a lazy table from provided PFrame.

    Corresponds to the ReadFrameStep defined in the TypeScript type definitions.
    """
    directory: str  # Path to the PFrame directory
    name: str  # Name to assign to the loaded DataFrame in the tablespace

    schema: Optional[List[ColumnSchema]] = None
    n_rows: Optional[int] = None

    def execute(self, ctx: StepContext):
        pass
