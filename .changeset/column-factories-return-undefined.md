---
"@platforma-sdk/model": minor
---

`Column`, `ColumnRecipe`, `DataColumn` and its `fromId`, `fromPlRef` and `fromAccessor` factories return `undefined` for a column that is absent from the render ctx, as they already did for one still resolving and now do for an export that is not a column. A missing column is an ordinary state — the upstream block has not run yet, or a reference made by a project template points at a block that does not provide it — and the thrown `ColumnAbsentError` made `Column(ref)?.getSpec()` fail the whole output instead. `ColumnAbsentError` is removed. To tell an absent column from a resolving one, use `ColumnRecipe.getStatus` or the `DataColumn.getStatus*` functions. A block picks this up when it is rebuilt with this SDK.
