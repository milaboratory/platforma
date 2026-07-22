---
"@milaboratories/pl-model-common": patch
"@milaboratories/pf-driver": patch
"@platforma-sdk/ui-vue": patch
---

Native table export now uses the disambiguated column labels shown in the table (from the `PlDataTable` `columnsMeta` sidecar) instead of the raw spec `pl7.app/label`. This fixes export failures when exporting a table with many columns whose intrinsic labels collide — the native `exportPTable` path rejects duplicate header names.

`exportPTable`/`writePTableToFs` options gain an optional `headerNames` field (aligned 1:1 with `columnIndices`). It is additive and backward compatible: older runtimes ignore it and keep deriving header names from the column spec.
