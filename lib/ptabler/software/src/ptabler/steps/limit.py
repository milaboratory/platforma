from .base import PStep, StepContext


class Limit(PStep, tag="limit"):
    """
    PStep to limit the number of rows in a table.

    This step retrieves a specified table (LazyFrame) from the tablespace,
    limits it to the specified number of rows, and stores the resulting
    limited table under a new name in the tablespace.
    Corresponds to the LimitStep defined in the TypeScript type definitions.
    """
    input_table: str
    output_table: str
    n: int

    def execute(self, ctx: StepContext):
        lf = ctx.get_table(self.input_table)
        limited_lf = lf.limit(self.n)
        ctx.put_table(self.output_table, limited_lf)
