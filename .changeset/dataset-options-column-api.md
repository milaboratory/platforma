---
"@platforma-sdk/model": minor
---

`buildDatasetOptions` finds datasets, filters and enrichments through `ColumnsCollection` instead of the deprecated `ctx.resultPool`. A `primary` selector is now matched by the host. Result pool columns with the same name, domain and axes are offered once. `filterMatchesToOptions` derives each filter's ref from the column id, so `FilterMatchOptions.refsByObjectId` and `buildRefMap` are removed.
