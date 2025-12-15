# @platforma-open/software-ptabler

## 1.14.0

### Minor Changes

- 2e7bc1c: add unique operation for ptabler df

## 1.13.5

### Patch Changes

- dca2e4f: PFrames version bump

## 1.13.4

### Patch Changes

- 8a4a6fc: Verify there are no duplicating axes keys

## 1.13.3

### Patch Changes

- aa8a03e: Switch to custom built lts-cpu versions of polars extensions

## 1.13.2

### Patch Changes

- 30114f3: PFrames version bump

## 1.13.1

### Patch Changes

- 30aa61b: PFrames version bump

## 1.13.0

### Minor Changes

- 3ef2381: Generelazation filters and annotations

## 1.12.12

### Patch Changes

- 5b9919d: PFrames version bump

## 1.12.11

### Patch Changes

- ff47e1b: PFrames version bump

## 1.12.10

### Patch Changes

- 4c0c064: PFrames version bump in ptabler

## 1.12.9

### Patch Changes

- 9b1156e: Fix axis selector

## 1.12.8

### Patch Changes

- 45dd202: PFrames version bump, workflow-tengo fixes for parquet support

## 1.12.7

### Patch Changes

- 60083a1: Parquet write

## 1.12.6

### Patch Changes

- 15d75b4: FlatBuffer validation options maxed

## 1.12.5

### Patch Changes

- bb07805: xsv.exportFrame migration to ptabler

## 1.12.4

### Patch Changes

- d14b733: Allow DuckDB to spill on disk

## 1.12.3

### Patch Changes

- 349375b: Ptabler - saveFrameDirect for exporting data as Parquet PFrame

## 1.12.2

### Patch Changes

- d58f182: Use fresh python run environment with bugfix for pip on windows

## 1.12.1

### Patch Changes

- 69c33c1: Re-release ptabler once again to check CI issues

## 1.12.0

### Minor Changes

- c11e4aa: feat: Package ptabler and ptexter as Docker images

  This change introduces Docker support for the ptabler and ptexter packages, allowing them to be distributed as Docker images. This simplifies deployment and ensures a consistent execution environment.

## 1.11.2

### Patch Changes

- a716ccd: Fix fill null behaviour to fill null and added fill NaN to fill NaNs

## 1.11.1

### Patch Changes

- bcde71e: Moved to platforma repository

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

## 1.6.1

### Patch Changes

- 6561d34: Dependency and environment upgrade

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
