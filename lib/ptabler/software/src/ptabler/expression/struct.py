import polars as pl
import polars.selectors as cs
from typing import Union, Optional, List

from ptabler.common import PType, toPolarsType
from .base import Expression

AnyExpression = Expression


class StructFieldExpression(Expression, tag='struct_field'):
    """
    Represents a struct field access operation for nested data structures.
    Extracts one or more fields from a struct expression, commonly used for JSON data.
    Corresponds to the StructFieldExpression in TypeScript definitions.
    Uses Polars' struct.field functionality for accessing nested fields.
    
    When fields is a list, performs recursive field access where each element
    represents a level in the nested structure.
    """
    struct: 'AnyExpression'
    """The struct expression to extract fields from."""
    fields: Union[str, List[str]]
    """
    The field name(s) to extract from the struct.
    - If a string, extracts a single field from the struct.
    - If a list, performs recursive field access where each element represents a level in the nested structure.
    """
    dtype: Optional[PType] = None
    """
    Optional expected data type for the returned value.
    This can be used for type validation or casting of the extracted field.
    """
    default: Optional[Union[str, int, float, bool, None]] = None
    """
    Optional default value to return if the field is not found or is null.
    If not provided and the field is missing, the operation returns null.
    Only constant scalar values are supported.
    """

    def to_polars(self) -> pl.Expr:
        """
        Converts the expression to a Polars struct.field expression.
        
        Gracefully handles null struct values using conditional logic to avoid
        schema mismatch issues that can occur with fill_null approaches.
        
        Supports both single field access and recursive field access for nested structures.
        Applies optional dtype casting and default values as specified.
        
        Returns:
            A Polars expression that extracts the specified field(s) from the struct,
            returning null or the default value for records where the struct or field is missing.
        """
        polars_struct = self.struct.to_polars()
        
        kwargs = {}
        if self.dtype is not None:
            kwargs['return_dtype'] = toPolarsType(self.dtype)

        def convert_value(value):
            if value is None:
                return None
            if self.dtype is None:
                return value
            
            try:
                if self.dtype == "String":
                    return str(value)
                elif self.dtype in ["Int64", "Int32", "Int", "Long"]:
                    return int(float(value)) if value is not None else None
                elif self.dtype in ["Float64", "Float32", "Float", "Double"]:
                    return float(value)
                elif self.dtype == "Boolean":
                    if isinstance(value, bool):
                        return value
                    elif isinstance(value, str):
                        return value.lower() in ('true', '1', 'yes', 'on')
                    else:
                        return bool(value)
                else:
                    return value
            except (ValueError, TypeError):
                return value
        
        converted_default = convert_value(self.default)

        if isinstance(self.fields, str):
            def extract_single_field(x):
                if x is not None and isinstance(x, dict):
                    result = x.get(self.fields)
                    if result is not None:
                        return convert_value(result)
                return converted_default
            
            result_expr = polars_struct.map_elements(
                extract_single_field, 
                skip_nulls=False,
                **kwargs
            )
        else:
            def extract_nested_fields(x):
                if x is None or not isinstance(x, dict):
                    return converted_default
                
                current = x
                for field in self.fields:
                    if current is None or not isinstance(current, dict):
                        return converted_default
                    current = current.get(field)
                
                if current is not None:
                    return convert_value(current)
                else:
                    return converted_default
            
            result_expr = polars_struct.map_elements(
                extract_nested_fields, 
                skip_nulls=False,
                **kwargs
            )
        
        return result_expr