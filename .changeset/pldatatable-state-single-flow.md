---
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

PlAgDataTableV2 no longer hangs on "Data is not computed" or "Loading data…" when it mounts on a source its saved state does not name.

- The model builds the table from the saved settings of the source the UI shows, including the fast search; `pTableParams` keeps only the pointer to that source, and its other fields are now typed `null`.
- Each source's cache entry keeps its sorting and hidden columns in its own `sorting` and `hiddenColIds` fields. `gridState` stays the grid's own state, kept only to restore the grid; nothing but the grid reads it.
- The table writes its state through one path: every write brings the saved state in line with the source on screen and applies the user's pending edits, so mounting on a new source writes the same way a sort does. Edits the platform has not reported back yet survive a re-push of the older state.
- Grid state reports are stored under the source the grid's columns belong to.
- While the model computes, the table shows the running placeholder instead of "Data is not computed".
- New `createPlDataTableV3` options: `fixedFilters` (applied on every render, not stored, not shown) and `ignoreSheets` (build the table without the sheet selection). New `readPlDataTableSheetsState` reads the sheet values picked for the source on screen.
