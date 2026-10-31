---
"@milaboratories/pl-model-common": patch
"@milaboratories/columns-collection-driver": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/model": patch
---

`ColumnsCollection` holds columns only. It skips exports that are not columns, such as the `kind: "File"` library of MiXCR Clonotyping, and ids whose spec is not written yet or that have left the result pool. `ResultPoolColumnsProvider` and `buildDatasetOptions` skip non-column exports too. For such an export, `Column(id)`, `DataColumn.fromId` and `DataColumn.fromPlRef` throw `ColumnAbsentError`, and the status getters return `"absent"`. `ColumnsCollection.getColumns()` drops absent ids instead of throwing. A block built with this version behaves the same on older desktops.
