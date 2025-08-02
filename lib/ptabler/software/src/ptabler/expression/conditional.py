import typing
import msgspec
import polars as pl

from .base import Expression

AnyExpression = Expression


class WhenThenClause(msgspec.Struct, frozen=True, rename="camel"):
    """
    Represents a single '''when''' condition and its corresponding '''then''' result expression.
    Used within the WhenThenOtherwiseExpression. Corresponds to the WhenThenClause in TS.
    """
    when: 'AnyExpression'  # : The condition expression. Should evaluate to a boolean.
    then: 'AnyExpression'  # : The result expression if the '''when''' condition is true.


class WhenThenOtherwiseExpression(Expression, tag='when_then_otherwise'):
    """
    Represents a conditional expression evaluating a series of '''when''' conditions.
    Returns the corresponding '''then''' expression's value for the first true '''when'''.
    If no '''when''' is true, returns the '''otherwise''' expression's value.
    Mimics Polars' when/then/otherwise functionality. Corresponds to WhenThenOtherwiseExpression in TS.
    """
    conditions: list[WhenThenClause]  # : An array of "when/then" clauses evaluated in order.
    # : The expression whose value is returned if none of the "when" conditions are met.
    otherwise: 'AnyExpression'

    def to_polars(self) -> pl.Expr:
        """
        Builds the Polars when/then/otherwise expression chain directly.
        """
        if not self.conditions:
            # If there are no conditions, just return the otherwise expression
            return self.otherwise.to_polars()

        # Start the chain with the first condition
        first_clause = self.conditions[0]
        polars_expr = pl.when(
            first_clause.when.to_polars()
        ).then(
            first_clause.then.to_polars()
        )

        # Chain the remaining conditions
        for condition_clause in self.conditions[1:]:
            polars_expr = polars_expr.when(
                condition_clause.when.to_polars()
            ).then(
                condition_clause.then.to_polars()
            )

        # Add the final otherwise clause
        polars_expr = polars_expr.otherwise(self.otherwise.to_polars())

        return polars_expr


class FillNaExpression(Expression, tag='fill_na'):
    """
    Represents a fill NA (null) operation.
    If the 'input' expression evaluates to null, the 'fillValue' expression is used.
    Otherwise, the 'input' expression's value is used.
    Corresponds to the FillNaExpression in TypeScript.
    """
    input: 'AnyExpression'  # : The primary expression to evaluate.
    fill_value: 'AnyExpression'  # : The expression whose value is used if 'input' is null.

    def to_polars(self) -> pl.Expr:
        """
        Converts the expression to a Polars expression using fill_null.
        """
        return self.input.to_polars().fill_null(self.fill_value.to_polars())
