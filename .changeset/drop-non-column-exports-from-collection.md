---
"@milaboratories/pl-model-common": patch
"@milaboratories/columns-collection-driver": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/model": patch
---

`ColumnsCollection` and `ResultPoolColumnsProvider` skip exports that are not columns, such as the `kind: "File"` library of MiXCR Clonotyping or Library Builder, so they no longer reach code that reads `axesSpec`. For such an export, `Column(id)`, `Column(ref)`, `DataColumn.fromId` and `DataColumn.fromPlRef` throw `ColumnAbsentError`, and `DataColumn.getStatusById` and `getStatusByPlRef` return `"absent"`. The spec of such an export can still be read with the deprecated `ctx.resultPool.getSpecByRef`; files have no other API yet. `ColumnsCollection.isEmpty()` is `true` when a collection holds only such exports. `ColumnsCollection.getColumns()` drops ids whose column is absent instead of throwing `ColumnAbsentError`, and `buildDatasetOptions` no longer offers exports that are not columns. A block built with this version skips non-column exports on older desktops too.
