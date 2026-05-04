---
"@platforma-sdk/model": minor
---

`buildDatasetOptions`: scope filter discovery to the result pool only (block outputs and prerun no longer pollute the filter dropdown), add a `filter` predicate to restrict eligible filter columns, and skip filter matches without a PlRef instead of throwing. Removes the need for callers to wrap `buildDatasetOptions` in try/catch.
