import msgspec
import polars as pl


class Expression(msgspec.Struct, tag_field="type", rename="camel"):
    """
    Base class for all expressions in the pipeline.
    """
    def to_polars(self) -> pl.Expr:
        """
        Renders the expression as a Polars expression.
        """
        pass
