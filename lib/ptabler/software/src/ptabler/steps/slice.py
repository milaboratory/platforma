from .base import PStep, StepContext


class Slice(PStep, tag="slice"):
    """
    PStep to extract a contiguous row range from a table.

    Retrieves a table (LazyFrame) from the tablespace, extracts rows
    [offset, offset + length), and stores the result under a new name.
    Ranges that extend past the end of the frame are silently clipped.
    Corresponds to the SliceStep defined in the TypeScript type definitions.
    """
    input_table: str
    output_table: str
    offset: int
    length: int

    def execute(self, ctx: StepContext):
        lf = ctx.get_table(self.input_table)
        sliced_lf = lf.slice(self.offset, self.length)
        ctx.put_table(self.output_table, sliced_lf)
