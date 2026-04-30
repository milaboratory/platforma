# @platforma-open/software-ptabler.types

## 1.15.3

### Patch Changes

- Updated dependencies [6369956]
  - @milaboratories/pl-model-common@1.38.0

## 1.15.2

### Patch Changes

- Updated dependencies [a40505e]
  - @milaboratories/pl-model-common@1.37.0

## 1.15.1

### Patch Changes

- @milaboratories/pl-model-common@1.36.2

## 1.15.0

### Minor Changes

- e5596f5: Migrate `pt` emitters and ptabler `read_frame` step to the `SpecQuery` shape, and fix a TS type bug.

  **`pl-model-common` type fix:** `QuerySliceAxes.axisFilters[i].axisSelector` was typed as `QueryAxisSelector<A>` (wrapped `{type: "axis", id: A}`), which disagreed with the wire format — Rust (`pframes-rs/packages/bridge/src/query/query_slice_axes.rs`) and Python (`polars_pf.json.query_spec.SpecQuerySliceAxisFilter`) both serialize `axis_selector` as the bare selector (`SingleAxisSelector` at the spec layer, `number` at the data layer). The Rust `serialize_slice_axes` test at `pframes-rs/packages/spec/src/query_spec/query.rs:381` confirms the flat wire. Updated `QuerySliceAxes<Q, A>` to take `A` unconstrained, updated `SpecQuerySliceAxes` to use `SingleAxisSelector` directly and `DataQuerySliceAxes` to use `number` directly, and corrected the jsdoc example.

  - `pt.p.column/slicedColumn/inner/full/outer` now emit `SpecQueryJoinEntry` nodes (`column`, `sliceAxes`, `innerJoin`, `fullJoin`, `outerJoin`) byte-compatible with the output of `PFrameSpecDriver.buildQuery`.
  - Added `pt.p.linkerJoin` for emitter completeness against the `SpecQuery` union.
  - `read_frame.request` is now `PTableDefV2<PObjectId>` (`{ query: SpecQuery }`) — dropped the legacy `{ src, filters: [] }` sibling shape. The `filters` list goes away because filters live as `SpecQueryFilter` nodes inside the query tree.
  - ptabler Python step (`ptabler.steps.read_frame.ReadFrame`) takes `PTableDefV2` and forwards `request.query` directly to `polars_pf.pframe_source`, which accepts `SpecQuery` natively.
  - Bumped `polars-pf` requirement to `1.1.27` (shipped in `runenv-python-3.12.10@1.3.9`; catalog `runenv-python-3` bumped `1.7.4 → 1.8.0` to pull it in). Updated the `test_duplicate_axis_values_failure` assertion to match the new error wording ("multiple rows with the same axis key").
  - `slicedColumn` no longer uses the `new_id`/`column_id` rename pair — each slice wraps a direct `Column(name)` reference under a `sliceAxes` node with axis selectors resolved from the column's `axesSpec`. This aligns with the Rust upgrade rule that rejects `new_id != column_id` (see `pframes-rs/packages/spec/src/requests/query_upgrade/logic.rs:35`).

### Patch Changes

- Updated dependencies [e5596f5]
  - @milaboratories/pl-model-common@1.36.1

## 1.14.15

### Patch Changes

- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
  - @milaboratories/pl-model-common@1.36.0

## 1.14.14

### Patch Changes

- Updated dependencies [10eec21]
  - @milaboratories/pl-model-common@1.35.0

## 1.14.13

### Patch Changes

- Updated dependencies [a2304be]
  - @milaboratories/pl-model-common@1.34.1

## 1.14.12

### Patch Changes

- Updated dependencies [8eb112a]
- Updated dependencies [8eb112a]
  - @milaboratories/pl-model-common@1.34.0

## 1.14.11

### Patch Changes

- Updated dependencies [1411dea]
  - @milaboratories/pl-model-common@1.33.0

## 1.14.10

### Patch Changes

- Updated dependencies [49485fd]
  - @milaboratories/pl-model-common@1.32.1

## 1.14.9

### Patch Changes

- Updated dependencies [436d4a9]
  - @milaboratories/pl-model-common@1.32.0

## 1.14.8

### Patch Changes

- fd0b5e3: Slice operation support

## 1.14.7

### Patch Changes

- 54f60b7: Slice operation support

## 1.14.6

### Patch Changes

- Updated dependencies [9c3b6c2]
  - @milaboratories/pl-model-common@1.31.2

## 1.14.5

### Patch Changes

- @milaboratories/pl-model-common@1.31.1

## 1.14.4

### Patch Changes

- Updated dependencies [5becf87]
  - @milaboratories/pl-model-common@1.31.0

## 1.14.3

### Patch Changes

- Updated dependencies [74a2ffa]
  - @milaboratories/pl-model-common@1.30.0

## 1.14.2

### Patch Changes

- Updated dependencies [cfee265]
  - @milaboratories/pl-model-common@1.29.0

## 1.14.1

### Patch Changes

- Updated dependencies [e1d62fe]
  - @milaboratories/pl-model-common@1.28.0

## 1.14.0

### Minor Changes

- d59f5fe: New collection columns implementation

### Patch Changes

- Updated dependencies [d59f5fe]
  - @milaboratories/pl-model-common@1.27.0

## 1.13.20

### Patch Changes

- Updated dependencies [227002e]
  - @milaboratories/pl-model-common@1.26.1

## 1.13.19

### Patch Changes

- Updated dependencies [b4036fb]
  - @milaboratories/pl-model-common@1.26.0

## 1.13.18

### Patch Changes

- Updated dependencies [15959f8]
  - @milaboratories/pl-model-common@1.25.3

## 1.13.17

### Patch Changes

- 79156bc: fix dense axis
- Updated dependencies [79156bc]
  - @milaboratories/pl-model-common@1.25.2

## 1.13.16

### Patch Changes

- Updated dependencies [523a59f]
  - @milaboratories/pl-model-common@1.25.1

## 1.13.15

### Patch Changes

- Updated dependencies [01d0b52]
  - @milaboratories/pl-model-common@1.25.0

## 1.13.14

### Patch Changes

- Updated dependencies [cb28fde]
  - @milaboratories/pl-model-common@1.24.11

## 1.13.13

### Patch Changes

- Updated dependencies [866a323]
  - @milaboratories/pl-model-common@1.24.10

## 1.13.12

### Patch Changes

- Updated dependencies [a3659cd]
  - @milaboratories/pl-model-common@1.24.9

## 1.13.11

### Patch Changes

- Updated dependencies [4f04561]
  - @milaboratories/pl-model-common@1.24.8

## 1.13.10

### Patch Changes

- Updated dependencies [0ae1854]
  - @milaboratories/pl-model-common@1.24.7

## 1.13.9

### Patch Changes

- @milaboratories/pl-model-common@1.24.6

## 1.13.8

### Patch Changes

- a6ea24f: silent ci tests
- Updated dependencies [a6ea24f]
  - @milaboratories/pl-model-common@1.24.5

## 1.13.7

### Patch Changes

- f89a883: full integration oxc
- Updated dependencies [f89a883]
  - @milaboratories/pl-model-common@1.24.4

## 1.13.6

### Patch Changes

- Updated dependencies [0099ff7]
  - @milaboratories/pl-model-common@1.24.3

## 1.13.5

### Patch Changes

- Updated dependencies [4713838]
  - @milaboratories/pl-model-common@1.24.2

## 1.13.4

### Patch Changes

- Updated dependencies [f819dfd]
  - @milaboratories/pl-model-common@1.24.1

## 1.13.3

### Patch Changes

- Updated dependencies [1694d1a]
  - @milaboratories/pl-model-common@1.24.0

## 1.13.2

### Patch Changes

- Updated dependencies [fc75a16]
  - @milaboratories/pl-model-common@1.23.0

## 1.13.1

### Patch Changes

- Updated dependencies [88f33fa]
  - @milaboratories/pl-model-common@1.22.0

## 1.13.0

### Minor Changes

- 2e7bc1c: add unique operation for ptabler df

## 1.12.6

### Patch Changes

- Updated dependencies [5deb79a]
  - @milaboratories/pl-model-common@1.21.10

## 1.12.5

### Patch Changes

- Updated dependencies [bf6fe49]
  - @milaboratories/pl-model-common@1.21.9

## 1.12.4

### Patch Changes

- Updated dependencies [2c07d5a]
  - @milaboratories/pl-model-common@1.21.8

## 1.12.3

### Patch Changes

- Updated dependencies [d088e83]
  - @milaboratories/pl-model-common@1.21.7

## 1.12.2

### Patch Changes

- Updated dependencies [17e5fe7]
  - @milaboratories/pl-model-common@1.21.6

## 1.12.1

### Patch Changes

- Updated dependencies [55b218b]
  - @milaboratories/pl-model-common@1.21.5

## 1.12.0

### Minor Changes

- 3ef2381: Generelazation filters and annotations

### Patch Changes

- Updated dependencies [38da155]
  - @milaboratories/pl-model-common@1.21.4

## 1.11.5

### Patch Changes

- 60083a1: Parquet write

## 1.11.4

### Patch Changes

- bb07805: xsv.exportFrame migration to ptabler
- Updated dependencies [bb07805]
  - @milaboratories/pl-model-common@1.21.3

## 1.11.3

### Patch Changes

- 349375b: Ptabler - saveFrameDirect for exporting data as Parquet PFrame

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
