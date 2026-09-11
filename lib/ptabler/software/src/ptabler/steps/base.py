import os
from pathlib import Path
from typing import Optional
import msgspec
import polars as pl
import dataclasses

type TableSpace = dict[str, pl.LazyFrame]

@dataclasses.dataclass
class GlobalSettings:
    root_folder: Path
    frame_folder: Optional[Path] = None
    spill_folder: Optional[Path] = None

class StepContext:
    """
    Context object that provides methods to manage tables in the table space.
    This replaces the previous StepParams and StepResult pattern.
    """
    def __init__(
        self,
        settings: GlobalSettings,
        initial_table_space: TableSpace | None = None,
    ):
        self._settings = settings
        self._table_space = initial_table_space if initial_table_space is not None else {}
        self._lazy_frames: list[pl.LazyFrame] = []
        self._chained_tasks: list[callable] = []
        self._partial_outputs: list[str] = []
    
    @property
    def settings(self) -> GlobalSettings:
        """Returns the global settings (read-only)."""
        return self._settings
    
    def get_table(self, table_name: str) -> pl.LazyFrame:
        """
        Gets a lazy frame from the table space without removing it.
        
        Args:
            table_name: Name of the table to get
            
        Returns:
            The lazy frame from the table
            
        Raises:
            ValueError: If the table doesn't exist
        """
        if table_name not in self._table_space:
            raise ValueError(
                f"Table '{table_name}' not found in table space. "
                f"Available tables: [{', '.join(self._table_space.keys())}]"
            )
        return self._table_space[table_name]
    
    def put_table(self, table_name: str, lazy_frame: pl.LazyFrame):
        """
        Puts or replaces a lazy frame in the table space.
        
        Args:
            table_name: Name of the table to store
            lazy_frame: The lazy frame to store
        """
        self._table_space[table_name] = lazy_frame
    
    def add_sink(self, lazy_frame: pl.LazyFrame):
        """
        Adds a lazy frame to the collection of sink operations.
        
        Args:
            lazy_frame: The lazy frame to add
        """
        self._lazy_frames.append(lazy_frame)
    
    def chain_task(self, task: callable):
        """
        Adds a task to be executed after all sink operations are completed.
        
        Args:
            task: A callable (lambda or function) to be executed later
        """
        self._chained_tasks.append(task)
    
    
    def add_partial_output(self, path: str):
        """
        Records a file a sink writes before it is moved onto its target.

        A run that fails leaves those behind, and in a block's working directory a
        leftover file is not inert — it is collected as part of the block's output. The
        workflow removes whatever is still registered here once execution ends.

        Args:
            path: Absolute path of the partial file
        """
        self._partial_outputs.append(path)

    @property
    def partial_outputs(self) -> list[str]:
        """Returns the partial sink files recorded so far (read-only)."""
        return self._partial_outputs

    def cleanup_partial_outputs(self):
        """
        Removes every partial sink file still recorded, and forgets them.

        A partial file that reached its target has already been moved off the disk path
        this holds, so removing what is left removes only the writes that never landed.
        Safe to call more than once.
        """
        for partial_output in self._partial_outputs:
            try:
                os.remove(partial_output)
            except FileNotFoundError:
                pass
        self._partial_outputs = []

    def into_parts(self) -> tuple[dict[str, pl.LazyFrame], list[pl.LazyFrame], list[callable]]:
        """
        Destructs the StepContext and returns its internal state.
        
        This method should only be used in workflow execution with lazy=True.
        It returns the internal table_space, lazy_frames, and chained_tasks without copying,
        effectively consuming the context.
        
        Returns:
            A tuple of (table_space, lazy_frames, chained_tasks)
        """
        return self._table_space, self._lazy_frames, self._chained_tasks


class PStep(msgspec.Struct, tag_field="type", rename="camel"):
    """
    Base class for all steps in the pipeline.
    """
    def execute(self, ctx: StepContext):
        """
        Executes the current step within the PTabler workflow.

        This method takes a StepContext object that provides methods to:
        - get_table: Return a lazy frame from the table space without removing it
        - put_table: Add or replace a lazy frame in the table space
        - add_sink: Add a lazy frame for sink operations
        - chain_task: Add a task to be executed after all sink operations are completed

        Args:
            ctx: A StepContext object that manages the table space and
                    provides methods for table operations.
        """
        pass
