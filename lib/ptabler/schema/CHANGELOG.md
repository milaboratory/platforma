# @platforma-open/software-ptabler.types

## 1.11.0

### Minor Changes

- 3e5ceb3: - Added `StructFieldExpression` for accessing nested data structures in JSON imports and other hierarchical data
  - Implements robust error handling using `map_elements` with Python's dict `.get()` method for graceful handling of both null structs and missing fields
  - Supports deeply nested field access with automatic null propagation when intermediate structures are missing
  - Compatible with inconsistent schemas across records - missing fields return null rather than errors
  - Added comprehensive test coverage including edge cases for missing fields, null structs, and deeply nested non-existent paths
  - TypeScript schema definition with single field extraction support for optimal Polars compatibility

## 1.10.0

### Minor Changes

- 090082c: Add struct field expression for nested data access

  Added new `StructFieldExpression` to enable accessing fields within nested data structures like JSON objects. This feature is essential for working with complex data formats where nested structures are common.

  Key features:

  - Extract single fields from struct objects using `struct.field()` functionality
  - Support for deeply nested field access through expression chaining
  - Graceful handling of missing fields and struct objects
  - Compatible with JSON data processing workflows

  The implementation supports single field extraction and provides comprehensive test coverage for various edge cases including missing data scenarios.

## 1.9.0

### Minor Changes

- 97c6e69: Add NDJSON file format support for reading and writing data. Includes ReadNdjsonStep and WriteNdjsonStep with support for schema overrides, error handling, and row limiting. Enhanced CSV reader with nRows parameter support. Added BaseReadLogic abstraction for common file reading patterns.

## 1.8.0

### Minor Changes

- bd12a90: Additional string functions:
  - `contains` - Check if string contains a pattern (regex or literal)
  - `containsAny` - Check if string contains any of multiple patterns (Aho-Corasick algorithm)
  - `countMatches` - Count occurrences of a pattern in string (regex or literal)
  - `extract` - Extract parts of string using regex patterns and capture groups
  - `startsWith` - Check if string starts with a literal prefix
  - `endsWith` - Check if string ends with a literal suffix

## 1.7.0

### Minor Changes

- 0f7c0ae: Substring opertation now accepts expressions as it's start, ent and length arguments.

## 1.6.0

### Minor Changes

- d72aba5: WithoutColumns step

## 1.5.0

### Minor Changes

- 40f3aab: Refactored the sort step to use expressions instead of column names for defining sort criteria

## 1.4.0

### Minor Changes

- ff909b6: Support for group by expression

## 1.3.0

### Minor Changes

- 3d4f2d2: - Module rename
  - Add Select and WithColumns steps

## 1.2.0

### Minor Changes

- 37ba5b4: - Add new expressions for floor, round, ceil, and cast operations.
  - Use infer_schema & schema_override for CSV parsing.

## 1.1.0

### Minor Changes

- ac10024: - Add Concatenate step for vertical table concatenation; update related interfaces and tests. Introduce new tests for various concatenation scenarios, including error handling for missing tables and columns.
  - Add StringReplaceExpression for string replacement operations; update related interfaces and tests. Introduce functionality to replace patterns in strings with specified replacements, including support for regex and capture groups.
  - Add Sort step implementation with tests for sorting functionality, including handling of null values and stability.
  - Introduce migration guide from ptransform to ptabler, detailing key differences and step mappings.
  - Add FillNaExpression for handling null values
  - Enhance HashExpression to support additional encodings and optional bit truncation. Introduce 'base64_alphanumeric' and 'base64_alphanumeric_upper' encodings, and implement a 'bits' parameter for controlling output length based on entropy. Update related tests to validate new functionality and ensure correct behavior across various hash types and encodings.
  - Add WindowExpression and AggregationType for enhanced window function support. Introduce WindowExpression class for generic window function calls and define AggregationType for standard aggregation operations.
  - Enhance Join step to support column mappings with optional renaming. Refactor left_columns and right_columns to use a list of ColumnMapping objects instead of dictionaries.
  - Add coalesce option to Join step for handling key columns with the same name.

## 1.0.1

### Patch Changes

- 28353d4: chore: bump version
