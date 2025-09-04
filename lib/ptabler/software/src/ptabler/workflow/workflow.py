import msgspec
import polars as pl
from typing import List, overload, Literal, Union

from ptabler.steps import AnyPStep, GlobalSettings, TableSpace, StepContext


class PWorkflow(msgspec.Struct):
    """
    Represents the entire PTabler workflow, typically loaded from a JSON or YAML
    configuration file. It contains a sequence of PStep objects that are
    executed in order.

    The structure of this class maps directly to the PTablerWorkflow type
    defined in the TypeScript definitions, expecting a "workflow" field
    containing an array of step objects.
    """
    workflow: List[AnyPStep]

    @overload
    def execute(self, global_settings: GlobalSettings, initial_table_space: TableSpace | None = None) -> None:
        ...

    @overload
    def execute(self, global_settings: GlobalSettings, lazy: Literal[True], initial_table_space: TableSpace | None = None) -> tuple[TableSpace, List[pl.LazyFrame]]:
        ...

    def execute(self, global_settings: GlobalSettings, lazy: bool = False, initial_table_space: TableSpace | None = None) -> Union[None, tuple[TableSpace, List[pl.LazyFrame]]]:
        """
        Executes all steps in the workflow sequentially.

        This method initializes an empty tablespace (a dictionary mapping string
        names to Polars LazyFrames) and an empty list to collect LazyFrames
        corresponding to sink operations (e.g., writing to files).

        It then iterates through each step defined in `self.workflow`:
        1. Creates a StepContext for the current step with the current
           `table_space` and `global_settings`.
        2. Calls the `execute` method of the current step, passing the ctx.
        3. The step's `execute` method modifies the ctx directly.
        4. Sink LazyFrames are accumulated from the ctx.

        If `lazy` is False (default), after all steps are processed,
        `polars.collect_all()` is called on the accumulated sink LazyFrames
        to execute these I/O-bound operations. The `streaming=True` option
        is used for potentially better performance and lower memory usage.

        If `lazy` is True, this method returns the final `table_space` and
        the list of `all_sink_lazyframes` without executing `pl.collect_all()`.
        This mode is intended for testing or scenarios where deferred execution
        is desired.

        Args:
            global_settings: An instance of `GlobalSettings` containing global
                             configuration for the workflow, such as the root
                             directory for resolving file paths within steps.
            lazy: If True, skips the final `pl.collect_all()` and returns
                  the tablespace and sink lazyframes. Defaults to False.
            initial_table_space: An optional `TableSpace` to initialize the
                                 workflow's table space. If None, an empty
                                 tablespace is created. Defaults to None.

        Returns:
            If `lazy` is True, returns a tuple containing the final
            `TableSpace` and the list of all sink `pl.LazyFrame`s.
            If `lazy` is False, executes sink operations and returns `None`.
        """
        ctx = StepContext(
            settings=global_settings,
            initial_table_space=initial_table_space
        )

        for step_obj in self.workflow:
            step_obj.execute(ctx)

        table_space, all_sink_lazyframes = ctx.into_parts()
        if lazy:
            return table_space, all_sink_lazyframes
        else:
            if all_sink_lazyframes:
                # Execute all collected sink operations (e.g., write_csv).
                # The results of these operations (if any, usually None for writes)
                # are ignored here. The primary purpose is to trigger the computation
                # and I/O.
                # `comm_subplan_elim=True` (default) is generally good for performance.
                _ = pl.collect_all(all_sink_lazyframes)
                # Future consideration: Add logging for workflow completion or errors.
            return None
