import typing
import polars as pl

from .base import Expression

AnyExpression = Expression


class StringJoinExpression(Expression, tag='str_join'):
    """
    Represents a string join operation on an array of expressions.
    Corresponds to the StringJoinExpression in TypeScript definitions.
    """
    operands: list['AnyExpression']
    """An array of expressions whose string representations will be joined."""
    delimiter: typing.Optional[str] = None
    """An optional delimiter string to insert between joined elements."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars concat_str expression."""
        polars_operands = [op.to_polars() for op in self.operands]
        return pl.concat_str(polars_operands, separator=self.delimiter or "")


class ToUpperExpression(Expression, tag='to_upper'):
    """Converts a string expression to uppercase."""
    value: 'AnyExpression'
    """The string expression to operate on."""

    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().str.to_uppercase()


class ToLowerExpression(Expression, tag='to_lower'):
    """Converts a string expression to lowercase."""
    value: 'AnyExpression'
    """The string expression to operate on."""

    def to_polars(self) -> pl.Expr:
        return self.value.to_polars().str.to_lowercase()


class StrLenExpression(Expression, tag='str_len'):
    """Calculates the character length of a string expression."""
    value: 'AnyExpression'
    """The string expression to operate on."""

    def to_polars(self) -> pl.Expr:
        # Using len_chars for character count as per common expectation.
        # Use .str.len_bytes() if byte length is needed.
        return self.value.to_polars().str.len_chars()


class SubstringExpression(Expression, tag='substring'):
    """
    Represents a substring extraction operation on an expression.
    Corresponds to the SubstringExpression in TypeScript definitions.
    Extracts a portion of the string value resulting from the 'value' expression.
    The substring starts at the 'start' index (0-based).
    - If 'length' is provided, it specifies the maximum length of the substring.
    - If 'end' is provided, it specifies the index *before* which the substring ends.
    - If neither 'length' nor 'end' is provided, the substring extends to the end of the string.
    - 'length' and 'end' are mutually exclusive.
    If the requested substring range extends beyond the actual string length,
    the extraction automatically stops at the end of the string (Polars default behavior).
    """
    value: 'AnyExpression'
    """The expression whose string value will be used."""
    start: 'AnyExpression'
    """The starting position (0-indexed). Should evaluate to a number."""
    length: typing.Optional['AnyExpression'] = None
    """The length of the substring. Mutually exclusive with 'end'. Should evaluate to a number."""
    end: typing.Optional['AnyExpression'] = None
    """The end position of the substring (exclusive). Mutually exclusive with 'length'. Should evaluate to a number."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars str.slice expression."""
        if self.length is not None and self.end is not None:
            raise ValueError(
                "SubstringExpression cannot have both 'length' and 'end' defined.")

        polars_value = self.value.to_polars()
        polars_start = self.start.to_polars()
        
        if self.length is not None:
            polars_length = self.length.to_polars()
            return polars_value.str.slice(offset=polars_start, length=polars_length)
        elif self.end is not None:
            polars_end = self.end.to_polars()
            polars_length = polars_end - polars_start
            return polars_value.str.slice(offset=polars_start, length=polars_length)
        else:
            # If neither length nor end is provided, slice to end of string
            return polars_value.str.slice(offset=polars_start)


class StringReplaceExpression(Expression, tag='str_replace'):
    """
    Represents a string replacement operation.
    Corresponds to the StringReplaceExpression in TypeScript definitions.
    Replaces occurrences of a pattern (regex or literal) in a string expression
    with a replacement string.
    """
    value: 'AnyExpression'
    """The input string expression to operate on."""
    pattern: typing.Union['AnyExpression', str]
    """The pattern (regex or literal string) to search for."""
    replacement: typing.Union['AnyExpression', str]
    """The replacement string. Can use $n or ${name} for captured groups if pattern is a regex."""
    replace_all: typing.Optional[bool] = False
    """If true, replace all occurrences. If false (default), replace only the first."""
    literal: typing.Optional[bool] = False
    """If true, treat pattern as literal. If false (default), treat as regex."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars str.replace or str.replace_all expression."""
        polars_value = self.value.to_polars()

        if isinstance(self.pattern, Expression):
            polars_pattern = self.pattern.to_polars()
        else:
            polars_pattern = pl.lit(self.pattern)

        if isinstance(self.replacement, Expression):
            polars_replacement = self.replacement.to_polars()
        else:
            polars_replacement = pl.lit(self.replacement)

        use_literal = self.literal or False

        if self.replace_all:
            return polars_value.str.replace_all(
                pattern=polars_pattern,
                value=polars_replacement,
                literal=use_literal
            )
        else:
            # Polars' replace takes 'n' for number of replacements. n=1 for first match.
            return polars_value.str.replace(
                pattern=polars_pattern,
                value=polars_replacement,
                literal=use_literal,
                n=1
            )


class StringContainsExpression(Expression, tag='str_contains'):
    """
    Represents a string contains operation using regex or literal matching.
    Checks if the string contains the specified pattern anywhere within it.
    Based on polars.Series.str.contains - supports both regex and literal pattern matching.
    """
    value: 'AnyExpression'
    """The input string expression to search in."""
    pattern: typing.Union['AnyExpression', str]
    """The pattern to search for. Can be a regex pattern (default) or literal string when literal=True."""
    literal: typing.Optional[bool] = False
    """If true, treat the pattern as a literal string. If false, treat it as a regex pattern. Defaults to false."""
    strict: typing.Optional[bool] = True
    """If true, raise an error if pattern is invalid regex. If false, return null for invalid patterns. Defaults to true."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars str.contains expression."""
        polars_value = self.value.to_polars()
        
        if isinstance(self.pattern, Expression):
            polars_pattern = self.pattern.to_polars()
        else:
            polars_pattern = self.pattern
            
        use_literal = self.literal or False
        use_strict = self.strict if self.strict is not None else True
        
        return polars_value.str.contains(
            pattern=polars_pattern,
            literal=use_literal,
            strict=use_strict
        )


class StringContainsAnyExpression(Expression, tag='str_contains_any'):
    """
    Represents a string contains_any operation for multiple literal patterns.
    Returns true if the string contains ANY of the provided patterns using the Aho-Corasick algorithm.
    Based on polars.Series.str.contains_any - only supports literal string patterns, no regex.
    """
    value: 'AnyExpression'
    """The input string expression to search in."""
    patterns: list[str]
    """Array of literal string patterns to search for. Only supports immediate string values, not expressions."""
    ascii_case_insensitive: typing.Optional[bool] = False
    """Enable ASCII case insensitive matching. When this option is enabled, characters in the range A-Z will be treated as equivalent to a-z."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars str.contains_any expression."""
        polars_value = self.value.to_polars()
        use_ascii_case_insensitive = self.ascii_case_insensitive or False
        
        return polars_value.str.contains_any(
            patterns=self.patterns,
            ascii_case_insensitive=use_ascii_case_insensitive
        )


class StringCountMatchesExpression(Expression, tag='str_count_matches'):
    """
    Represents a string count_matches operation.
    Counts the number of times a pattern occurs in the string using regex or literal matching.
    Based on polars.Series.str.count_matches - supports both regex and literal pattern matching.
    """
    value: 'AnyExpression'
    """The input string expression to count matches in."""
    pattern: typing.Union['AnyExpression', str]
    """The pattern to count occurrences of. Can be a regex pattern (default) or literal string when literal=true."""
    literal: typing.Optional[bool] = False
    """If true, treat the pattern as a literal string. If false, treat it as a regex pattern. Defaults to false."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars str.count_matches expression."""
        polars_value = self.value.to_polars()
        
        if isinstance(self.pattern, Expression):
            polars_pattern = self.pattern.to_polars()
        else:
            polars_pattern = self.pattern
            
        use_literal = self.literal or False
        
        return polars_value.str.count_matches(
            pattern=polars_pattern,
            literal=use_literal
        )


class StringExtractExpression(Expression, tag='str_extract'):
    """
    Represents a string extract operation using regex patterns.
    Extracts the first match of a regex pattern from the string, optionally targeting specific capture groups.
    Based on polars.Series.str.extract - only supports regex patterns (no literal mode).
    """
    value: 'AnyExpression'
    """The input string expression to extract from."""
    pattern: typing.Union['AnyExpression', str]
    """The regex pattern to extract. Must be a valid regex pattern - no literal string mode is supported."""
    group_index: typing.Optional[int] = 0
    """The capture group index to extract. Group 0 is the entire match, group 1 is the first capture group, etc. Defaults to 0."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars str.extract expression."""
        polars_value = self.value.to_polars()
        
        if isinstance(self.pattern, Expression):
            polars_pattern = self.pattern.to_polars()
        else:
            polars_pattern = self.pattern
            
        use_group_index = self.group_index if self.group_index is not None else 0
        
        return polars_value.str.extract(
            pattern=polars_pattern,
            group_index=use_group_index
        )


class StringStartsWithExpression(Expression, tag='str_starts_with'):
    """
    Represents a string starts_with operation for literal prefix matching.
    Checks if the string starts with the specified literal prefix.
    Based on polars.Series.str.starts_with - only supports literal string matching, no regex.
    """
    value: 'AnyExpression'
    """The input string expression to check."""
    prefix: typing.Union['AnyExpression', str]
    """The literal string prefix to check for at the start of the string."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars str.starts_with expression."""
        polars_value = self.value.to_polars()
        
        if isinstance(self.prefix, Expression):
            polars_prefix = self.prefix.to_polars()
        else:
            polars_prefix = self.prefix
        
        return polars_value.str.starts_with(prefix=polars_prefix)


class StringEndsWithExpression(Expression, tag='str_ends_with'):
    """
    Represents a string ends_with operation for literal suffix matching.
    Checks if the string ends with the specified literal suffix.
    Based on polars.Series.str.ends_with - only supports literal string matching, no regex.
    """
    value: 'AnyExpression'
    """The input string expression to check."""
    suffix: typing.Union['AnyExpression', str]
    """The literal string suffix to check for at the end of the string."""

    def to_polars(self) -> pl.Expr:
        """Converts the expression to a Polars str.ends_with expression."""
        polars_value = self.value.to_polars()
        
        if isinstance(self.suffix, Expression):
            polars_suffix = self.suffix.to_polars()
        else:
            polars_suffix = self.suffix
        
        return polars_value.str.ends_with(suffix=polars_suffix)
