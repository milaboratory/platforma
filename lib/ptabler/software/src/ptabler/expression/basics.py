from cmath import log
import typing
import operator
import polars as pl

from ptabler.common import PType, toPolarsType

from .base import Expression

# Comparison Expressions

AnyExpression = Expression


class BinaryOperatorExpression(Expression):
    lhs: 'AnyExpression'
    rhs: 'AnyExpression'


class GtExpression(BinaryOperatorExpression, tag='gt'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() > self.rhs.to_polars()


class GeExpression(BinaryOperatorExpression, tag='ge'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() >= self.rhs.to_polars()


class EqExpression(BinaryOperatorExpression, tag='eq'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() == self.rhs.to_polars()


class LtExpression(BinaryOperatorExpression, tag='lt'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() < self.rhs.to_polars()


class LeExpression(BinaryOperatorExpression, tag='le'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() <= self.rhs.to_polars()


class NeqExpression(BinaryOperatorExpression, tag='neq'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() != self.rhs.to_polars()


# Binary Arithmetic Expressions

class PlusExpression(BinaryOperatorExpression, tag='plus'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() + self.rhs.to_polars()


class MinusExpression(BinaryOperatorExpression, tag='minus'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() - self.rhs.to_polars()


class MultiplyExpression(BinaryOperatorExpression, tag='multiply'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() * self.rhs.to_polars()


class TrueDivExpression(BinaryOperatorExpression, tag='truediv'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() / self.rhs.to_polars()


class FloorDivExpression(BinaryOperatorExpression, tag='floordiv'):
    def to_polars(self) -> pl.Expr:
        return self.lhs.to_polars() // self.rhs.to_polars()


# Unary Arithmetic Expressions

class UnaryArithmeticBaseExpression(Expression):
    value: 'AnyExpression'


class Log10Expression(UnaryArithmeticBaseExpression, tag='log10'):
    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().log10()


class LogExpression(UnaryArithmeticBaseExpression, tag='log'):
    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().log()


class Log2Expression(UnaryArithmeticBaseExpression, tag='log2'):
    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().log() / pl.lit(log(2))


class AbsExpression(UnaryArithmeticBaseExpression, tag='abs'):
    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().abs()


class SqrtExpression(UnaryArithmeticBaseExpression, tag='sqrt'):
    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().sqrt()


class FloorExpression(UnaryArithmeticBaseExpression, tag='floor'):
    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().floor()


class RoundExpression(UnaryArithmeticBaseExpression, tag='round'):
    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().round()


class CeilExpression(UnaryArithmeticBaseExpression, tag='ceil'):
    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().ceil()


class UnaryMinusExpression(UnaryArithmeticBaseExpression, tag='negate'):
    def to_polars(self) -> pl.Expr:
        return -self.value.to_polars()  # Unary minus operator

# Type casting


class CastExpression(Expression, tag='cast'):
    value: 'AnyExpression'
    dtype: PType
    strict: typing.Optional[bool] = None

    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().cast(toPolarsType(self.dtype), strict=self.strict or False)

# Boolean Logic Expressions


class AndExpression(Expression, tag='and'):
    operands: list['AnyExpression']

    def to_polars(self) -> pl.Expr:
        polars_operands = [op.to_polars() for op in self.operands]
        if not polars_operands:
            # Define behavior for empty operands: 'and' -> True
            return pl.lit(True)
        return pl.all_horizontal(polars_operands)


class OrExpression(Expression, tag='or'):
    operands: list['AnyExpression']

    def to_polars(self) -> pl.Expr:
        polars_operands = [op.to_polars() for op in self.operands]
        if not polars_operands:
            # Define behavior for empty operands: 'or' -> False
            return pl.lit(False)
        return pl.any_horizontal(polars_operands)


# Not Expression
class NotExpression(Expression, tag='not'):
    value: 'AnyExpression'

    def to_polars(self) -> pl.Expr:
        # Use bitwise NOT operator (~) which acts as logical NOT for boolean expressions in Polars
        return ~self.value.to_polars()


# Null Check Expressions

class IsNaExpression(Expression, tag='is_na'):
    value: 'AnyExpression'

    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().is_null()


class IsNotNaExpression(Expression, tag='is_not_na'):
    value: 'AnyExpression'

    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().is_not_null()


# Column Reference Expression
class ColumnReferenceExpression(Expression, tag='col'):
    name: str

    def to_polars(self) -> pl.Expr:
        return pl.col(self.name)


# Constant Value Expression
class ConstantValueExpression(Expression, tag='const'):
    value: typing.Union[str, int, float, bool, None]

    def to_polars(self) -> pl.Expr:
        return pl.lit(self.value)


# Min/Max Expressions

class MinExpression(Expression, tag='min'):
    operands: list['AnyExpression']

    def to_polars(self) -> pl.Expr:
        polars_operands = [op.to_polars() for op in self.operands]
        if not polars_operands:
            return pl.lit(None)
        return pl.min_horizontal(polars_operands)


class MaxExpression(Expression, tag='max'):
    operands: list['AnyExpression']

    def to_polars(self) -> pl.Expr:
        polars_operands = [op.to_polars() for op in self.operands]
        if not polars_operands:
            return pl.lit(None)
        return pl.max_horizontal(polars_operands)
