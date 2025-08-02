from typing import Optional
import msgspec
import polars as pl
import dataclasses

type TableSpace = dict[str, pl.LazyFrame]


@dataclasses.dataclass
class GlobalSettings:
    root_folder: str


class PStep(msgspec.Struct, tag_field="type", rename="camel"):
    """
    Base class for all steps in the pipeline.
    """
    def execute(self, table_space: TableSpace, global_settings: GlobalSettings) -> tuple[TableSpace, list[pl.LazyFrame]]:
        """
        Executes the current step within the PTabler workflow.

        This method takes the current state of the "tablespace" (a dictionary
        mapping string names to Polars LazyFrames) as input. It then performs
        the specific operations defined by the step's type, potentially
        modifying existing LazyFrames in the tablespace, adding new ones, or
        reading data into it.

        Args:
            table_space: A dictionary where keys are string identifiers and
                         values are Polars LazyFrame objects. This represents all
                         data currently available in the workflow.
            global_settings: Global settings for the workflow.

        Returns:
            A tuple containing:
            - The updated tablespace (TableSpace): The state of the tablespace
              after this step's execution.
            - A list of Polars LazyFrames (list[pl.LazyFrame]): This list
              accumulates LazyFrames that represent sink operations (e.g.,
              writing to files). These frames are intended to be collected
              globally at the end of the entire workflow execution using
              `polars.collect_all()`. For steps that only transform data
              within the tablespace, this list will typically be empty.
        """
        pass
