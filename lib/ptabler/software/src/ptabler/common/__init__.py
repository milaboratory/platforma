import typing
import polars as pl
from typing import Mapping


STRING_TO_POLARS_TYPE: Mapping[str, pl.DataType] = {
    "Int8": pl.Int8,
    "Int16": pl.Int16,
    "Int32": pl.Int32,
    "Int64": pl.Int64,
    "UInt8": pl.UInt8,
    "UInt16": pl.UInt16,
    "UInt32": pl.UInt32,
    "UInt64": pl.UInt64,
    "Float32": pl.Float32,
    "Float64": pl.Float64,
    "Boolean": pl.Boolean,
    "String": pl.String,  # pl.String is an alias for pl.Utf8
    "Date": pl.Date,
    "Datetime": pl.Datetime,  # Default time_unit is 'us' if parsed from string
    "Time": pl.Time,

    # Aliases
    "Int": pl.Int32,
    "Long": pl.Int64,
    "Float": pl.Float32,
    "Double": pl.Float64,
}

PType = typing.Literal[
    "Int8",
    "Int16",
    "Int32",
    "Int64",
    "UInt8",
    "UInt16",
    "UInt32",
    "UInt64",
    "Float32",
    "Float64",
    "Boolean",
    "String",
    "Date",
    "Datetime",
    "Time",

    # Aliases:
    "Int",
    "Long",
    "Float",
    "Double"
]

def toPolarsType(pType: PType) -> pl.DataType:
    polars_type_obj = STRING_TO_POLARS_TYPE.get(pType)
    if polars_type_obj:
        return polars_type_obj
    else:
        raise ValueError(f"Unknown Polars type string '{pType}'.")

