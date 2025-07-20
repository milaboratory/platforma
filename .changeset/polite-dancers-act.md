---
'@platforma-sdk/workflow-tengo': minor
---

Added new TsvContent output type and enhanced trace injection:

**New TsvContent Output Type:**
- Added `TsvContent` output type to `processColumn()` function for parsing TSV content to JSON PColumn data
- Simplified settings schema with `axes` and `columns` arrays containing `column` name and `spec` objects
- Automatic transformation from user settings to parse template format
- Integration with `parse-to-json.tpl.tengo` template for efficient TSV parsing
- Similar to Xsv but simpler: no partitioning, single parse call, direct JSON output
- Updated all output methods (`outputSpec`, `outputData`, `output`, etc.) to support TsvContent
- Added comprehensive validation using validation library with `TSV_CONTENT_SETTINGS_SCHEMA`

**Enhanced Trace Injection:**
- Added `override` option to `makeTrace().inject()` function with default value of `true`
- Added `overrideTrace` flag to `processColumn()` function with smart defaults:
  - Defaults to `true` when `traceSteps` is provided (override existing traces with new steps)
  - Defaults to `false` when no `traceSteps` are provided (preserve existing traces)
- Updated all trace injection calls in `processColumn` to respect the override setting

**Code Quality Improvements:**
- Replaced manual validation checks with `validation.assertType()` for better error messages
- Used `slices.map()` for functional array transformations instead of manual loops
- Applied defensive copying with `copy()` for all array operations to prevent mutations
