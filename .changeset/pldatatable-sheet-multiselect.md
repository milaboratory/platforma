---
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

PlAgDataTableV2 sheets can show several values at once, and blocks can fix filters and sorting the user cannot remove.

- `createPlDataTableSheet` takes `{ selection: "multiple" }`: the user then picks any number of the sheet's values, or all of them, in a multi-select dropdown. `PlDataTableSheet` carries `selection`, `"single"` by default. Such a sheet saves the picked `{ axisId, values }`, or `{ axisId, allValues: true }`, which also takes values that appear later.
- While a sheet shows several values, the table shows its axis and label column, and the fast search looks into the axis. `isSheetFixedToOneValue` tells whether a sheet's saved state picks a single value.
- New `createPlDataTableV3` options `fixedFilters` and `fixedSorting`: applied on every render, not stored, not shown and not removable by the user. The fixed sorting orders the rows first, and the user's sorting, or the block's default while the user has not sorted, orders them within it.
