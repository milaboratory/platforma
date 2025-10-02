import typing
from .base import Expression

from . import basics
from . import string
from . import fuzzy
from . import conditional
from . import window
from . import hash
from . import struct
from . import pframes

from .basics import (
    GtExpression, GeExpression, EqExpression, LtExpression, LeExpression, NeqExpression, PlusExpression,
    MinusExpression, MultiplyExpression, TrueDivExpression, FloorDivExpression, IsNaExpression, IsNotNaExpression,
    Log10Expression, LogExpression, Log2Expression, AbsExpression, SqrtExpression, UnaryMinusExpression,
    FloorExpression, RoundExpression, CeilExpression, CastExpression,
    OrExpression, NotExpression, ColumnReferenceExpression, ConstantValueExpression, MinExpression, MaxExpression,
    AndExpression, AxisReferenceExpression,
)
from .string import (
    StringJoinExpression, ToUpperExpression, ToLowerExpression, StrLenExpression, SubstringExpression,
    StringReplaceExpression, StringContainsExpression, StringContainsAnyExpression, StringCountMatchesExpression,
    StringExtractExpression, StringStartsWithExpression, StringEndsWithExpression,
)
from .fuzzy import (
    StringDistanceExpression, FuzzyStringFilterExpression,
)
from .conditional import (
    WhenThenClause, WhenThenOtherwiseExpression, FillNaNExpression, FillNullExpression
)
from .window import (
    RankExpression, CumsumExpression, WindowExpression
)
from .hash import (
    HashExpression,
)
from .struct import (
    StructFieldExpression,
)
from .pframes import (
    MatchesEcmaRegexExpression, ContainsFuzzyMatchExpression
)

# Define a Union type that includes all concrete expression types
AnyExpression = typing.Union[
    # Basic Comparisons
    GtExpression,
    GeExpression,
    EqExpression,
    LtExpression,
    LeExpression,
    NeqExpression,
    # Basic Binary Arithmetic
    PlusExpression,
    MinusExpression,
    MultiplyExpression,
    TrueDivExpression,
    FloorDivExpression,
    # Basic Unary Arithmetic
    Log10Expression,
    LogExpression,
    Log2Expression,
    AbsExpression,
    SqrtExpression,
    UnaryMinusExpression,
    FloorExpression,
    RoundExpression,
    CeilExpression,
    CastExpression,
    # Boolean Logic
    AndExpression,
    OrExpression,
    NotExpression,
    # Null Checks
    IsNaExpression,
    IsNotNaExpression,
    # Core Types
    ColumnReferenceExpression,
    AxisReferenceExpression,
    ConstantValueExpression,
    # Min/Max
    MinExpression,
    MaxExpression,
    # String Operations
    StringJoinExpression,
    ToUpperExpression,
    ToLowerExpression,
    StrLenExpression,
    SubstringExpression,
    StringReplaceExpression,
    StringContainsExpression,
    StringContainsAnyExpression,
    StringCountMatchesExpression,
    StringExtractExpression,
    StringStartsWithExpression,
    StringEndsWithExpression,
    # Fuzzy String Operations
    StringDistanceExpression,
    FuzzyStringFilterExpression,
    # Conditional Logic
    WhenThenOtherwiseExpression,
    FillNullExpression,
    FillNaNExpression,
    # Window Functions
    RankExpression,
    CumsumExpression,
    WindowExpression,
    # Hash Functions
    HashExpression,
    # String Distance Functions
    StringDistanceExpression,
    FuzzyStringFilterExpression,
    # Struct Operations
    StructFieldExpression,
    # PFrames Operations
    MatchesEcmaRegexExpression,
    ContainsFuzzyMatchExpression,
]

basics.AnyExpression = AnyExpression
string.AnyExpression = AnyExpression
fuzzy.AnyExpression = AnyExpression
conditional.AnyExpression = AnyExpression
window.AnyExpression = AnyExpression
hash.AnyExpression = AnyExpression
struct.AnyExpression = AnyExpression
pframes.AnyExpression = AnyExpression


__all__ = [
    "Expression",
    "AnyExpression",
    "GtExpression",
    "GtExpression",
    "GeExpression",
    "EqExpression",
    "LtExpression",
    "LeExpression",
    "NeqExpression",
    "PlusExpression",
    "MinusExpression",
    "MultiplyExpression",
    "TrueDivExpression",
    "FloorDivExpression",
    "Log10Expression",
    "LogExpression",
    "Log2Expression",
    "AbsExpression",
    "SqrtExpression",
    "UnaryMinusExpression",
    "FloorExpression",
    "RoundExpression",
    "CeilExpression",
    "AndExpression",
    "OrExpression",
    "NotExpression",
    "IsNaExpression",
    "IsNotNaExpression",
    "ColumnReferenceExpression",
    "ConstantValueExpression",
    "MinExpression",
    "MaxExpression",
    "StringJoinExpression",
    "ToUpperExpression",
    "ToLowerExpression",
    "StrLenExpression",
    "SubstringExpression",
    "StringReplaceExpression",
    "StringContainsExpression",
    "StringContainsAnyExpression",
    "StringCountMatchesExpression",
    "StringExtractExpression",
    "StringStartsWithExpression",
    "StringEndsWithExpression",
    "StringDistanceExpression",
    "FuzzyStringFilterExpression",
    "WhenThenClause",
    "WhenThenOtherwiseExpression",
    "FillNullExpression",
    "FillNaNExpression",
    "RankExpression",
    "CumsumExpression",
    "WindowExpression",
    "HashExpression",
    "StringDistanceExpression",
    "FuzzyStringFilterExpression",
    "StructFieldExpression",
    "MatchesEcmaRegexExpression",
    "ContainsFuzzyMatchExpression",
]
