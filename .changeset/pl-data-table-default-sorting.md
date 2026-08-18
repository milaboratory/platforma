---
"@platforma-sdk/ui-vue": patch
---

Keep the default `sorting` passed to `createPlDataTableV3` alive

`resolveSorting` falls back to the block's default sorting only while the
persisted user sorting is `null` — `[]` means "the user cleared the sorting"
and deliberately suppresses the default. The grid state never produced that
`null`: AG Grid omits `sort` from its state while nothing is sorted, and
`convertAgSortingToPTableSorting` turned the absent state into `[]`.

`onStateUpdated` fires as soon as the grid initialises, so the first persisted
state entry stamped `sorting: []` and the block's default sorting was dropped
from that moment on — the sorted column stayed in the table, just unsorted.

The absent sort state now converts to `null`, and `normalizeSort` (next to the
existing `normalizeColumnVisibility`, which solves the same problem for hidden
columns) turns it into an explicit `{ sortModel: [] }` only once the grid has
reported an explicit sort model before — so clearing the sorting by hand still
suppresses the default. Existing projects recover on the next render without a
state migration: their stored `gridState.sort` is absent, which now reads as
"untouched".
