---
"@milaboratories/pl-model-common": patch
"@milaboratories/columns-collection-driver": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/model": patch
---

`ColumnsCollection` holds columns only: its driver lists an id only once it has read a column spec for it, so it skips ids whose spec is not readable in the current render and exports that are not columns, such as the `kind: "File"` library of MiXCR Clonotyping. `AccessorColumnsProvider`, `ResultPoolColumnsProvider` and `buildDatasetOptions` skip them too. For such an export, `Column(id)`, `DataColumn.fromId`, `DataColumn.fromPlRef` and `DataColumn.fromAccessor` throw `ColumnAbsentError`; the status getters still report `present`, since status tells only whether the spec is readable. The driver ships with the desktop app; the rest reaches a block when it is rebuilt with this SDK. `ColumnsCollectionDriverHost.resolveSpec` now returns any `PObjectSpec`, and `ColumnsCollectionDriver.isEmpty` takes the host.
