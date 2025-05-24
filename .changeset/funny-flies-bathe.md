---
'@platforma-sdk/workflow-tengo': minor
---

Refactored XSV table generation and improved column handling in pframe bundles.

Key changes:
- Decoupled XSV Table Generation:
  - Removed `PColumnBundle.xsvTableBuilder()`.
  - Introduced `pframes.tsvFileBuilder()` and `pframes.csvFileBuilder()` for standalone XSV file creation.
- Enhanced Column Retrieval:
  - `PColumnBundle.getColumn()` updated for filtered ID support and axis-level data slicing, returning `{ key, spec, data }`.
  - `PColumnBundle.getColumns()` now uses `canonical.encode(r.ref)` for key generation.
- New Spec Utility:
  - Added `spec.axisSpecToMatcher()` for converting `AxisSpec` to a matcher object.
