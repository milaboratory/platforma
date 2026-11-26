---
"@milaboratories/pl-model-common": minor
"@platforma-sdk/model": minor
"@milaboratories/pl-middle-layer": minor
---

A column whose data failed no longer fails the PFrame it is in, and a table shows it with the `error` status. The data of a column failed when its `.data` field holds an error, with or without a value.
The field is read in one place, `readLeafData` in `@milaboratories/pl-model-common`, by both the middle layer and the block model, so a column the middle layer puts into a PFrame empty is the column the model reports as failed. It gives the data resource, `unset` for a field that is not there or has no value yet, or `errored` with the error resource.
Middle layer: a column given to `createPFrame`, `createPTable` or `createPTableV2` by id enters the frame with no values when its data failed, the way a column whose data is still to come already does. Before, one failed column failed the call for every column given with it, for example after an out-of-memory in one step of the block that produces them. A column whose `.spec` field holds an error still fails the call.
Model: a table built with `createPlDataTableV3` shows such a column with the `error` status. Before, a field with an error and no value made the table output throw, and a field with an error and a value was shown as ready. `DataColumn` leaves give `undefined` data for such a column. The error is found by the read the table already makes for its visible columns, so no column is read that was not read before, and `getDataStatus()` still does not read the data. New `getColumnDataState` tells ready, pending and failed data apart; `hasColumnData` behaves as before for data that did not fail.
New `TreeNodeAccessor.getField(step)` gives a field with its error, `{ value?, error? }`, or `undefined` when the resource has no such field; `traverse` and `resolve` throw the error as before. It is backed by a new `getField` method of the render context, and `AccessorLike` requires it.
New `requiresFieldErrors` block flag, set for every block the SDK builds: a block built with this SDK runs only in a desktop app whose middle layer offers the read, and an older one refuses it.
