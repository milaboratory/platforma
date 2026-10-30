---
"@milaboratories/pl-model-common": patch
"@milaboratories/columns-collection-driver": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/model": patch
---

`ColumnsCollection` and `ResultPoolColumnsProvider` skip exports that are not columns, such as the `kind: "File"` library of MiXCR Clonotyping or Library Builder, so they no longer reach code that reads `axesSpec`. For such an export, `Column(id)`, `Column(ref)`, `DataColumn.fromId` and `DataColumn.fromPlRef` throw `ColumnAbsentError`, and `DataColumn.getStatusById` and `getStatusByPlRef` return `"absent"`. Its spec can still be read with the deprecated `ctx.resultPool.getSpecByRef`; files have no other API yet.
