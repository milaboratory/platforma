---
"@milaboratories/pl-model-common": patch
"@milaboratories/pf-driver": patch
---

Make inline-column data info self-contained: the pf-driver now embeds each inline column's `typeSpec` (`{ axes, column }`) into its `dataInfo` before query lowering, so the data layer no longer relies on the inline column's `spec` field for type information. `ColumnIdAndTypeSpec.spec` is changed to the singular `ColumnTypeSpec` to match the data-layer wire format.
