---
"@platforma-sdk/model": minor
---

Allow declarative `ColumnSelector` as an alternative to the predicate `ColumnMatcher` in `ColumnOrderRule.match` and `ColumnVisibilityRule.match` (`ColumnsDisplayOptions`). Selector-based rules are matched via `PFrameSpecDriver.discoverColumns` — the same engine used by `ColumnCollection.findColumns`. Existing predicate-based rules continue to work unchanged.
