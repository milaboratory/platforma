
from .base import PStep, StepContext
from ..expression import AnyExpression


class Filter(PStep, tag="filter"):
    """
    PStep to filter rows in a table based on a specified condition.

    This step retrieves a specified table (LazyFrame) from the tablespace,
    applies a filter condition, and stores the resulting filtered table
    under a new name in the tablespace.
    Corresponds to the FilterStep defined in the TypeScript type definitions.
    """
    input_table: str
    output_table: str
    condition: AnyExpression


    def execute(self, ctx: StepContext):
        lf = ctx.get_table(self.input_table)

        # Convert the condition Expression to a Polars expression
        polars_condition = self.condition.to_polars()

        # Apply the filter
        filtered_lf = lf.filter(polars_condition)

        # Update the tablespace with the new filtered LazyFrame
        ctx.put_table(self.output_table, filtered_lf)
