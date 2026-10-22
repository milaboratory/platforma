---
"@milaboratories/pl-model-common": patch
"@milaboratories/columns-collection-driver": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/model": patch
---

A column error is a status, not a crash. Column enumeration no longer throws on an errored map field, block output or column field; it records the error and keeps the healthy columns.

- `ColumnResolutionStatus` and `ColumnFieldStatus` gain `"errored"`, the worst status: `errored ▸ absent ▸ resolving ▸ present`. `DataColumn.fromId` / `fromAccessor` throw `ColumnErroredError` for a column whose spec field, or the subtree it lives under, carries an error.
- `ColumnsCollection.getErrors()` lists the errors of the collection's sources: errored block outputs and subtrees, and columns whose spec or data field carries an error. `getColumns()` leaves out a column with an errored spec; a column with an errored data field stays, with data status `"errored"`, and a data table shows it as an error.
- An errored block output in `"current_block"` or the default ctx sources adds no columns and shows up in `getErrors()`. The render ctx gets `getAccessorErrorByName(name)`; on an older desktop the output's lookup error is caught and reported the same way. `getErrors()` is empty on an older desktop.
- Providers expose `getSourceErrors()` (`ColumnEntriesProvider`) and `getErrors()` (`ColumnsProvider`). `findDescendantsByType` and `indexAccessorRoot` return `{ hits | entries, errors }`.
