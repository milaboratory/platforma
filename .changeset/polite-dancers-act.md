---
'@platforma-sdk/workflow-tengo': patch
---

Enhanced trace injection with configurable override behavior:

- Added `override` option to `makeTrace().inject()` function with default value of `true`
- Added `overrideTrace` flag to `processColumn()` function with smart defaults:
  - Defaults to `true` when `traceSteps` is provided (override existing traces with new steps)
  - Defaults to `false` when no `traceSteps` are provided (preserve existing traces)
- Updated all trace injection calls in `processColumn` to respect the override setting
- Added comprehensive tests for the new override functionality
