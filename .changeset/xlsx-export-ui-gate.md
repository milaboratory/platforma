---
"@milaboratories/pl-model-common": minor
"@platforma-sdk/ui-vue": patch
"@milaboratories/pf-driver": patch
---

Gate the xlsx export option in the UI on table size instead of failing after the dialog.

`exportCsv` now calls `getShape` before opening the save dialog and drops the Excel filter when the table exceeds the per-sheet row limit, so oversized tables simply never offer xlsx rather than erroring out post-selection. The `pf-driver` rejection is kept as a safety net. The shared `XLSX_MAX_ROWS_PER_SHEET` constant is now exported from `@milaboratories/pl-model-common` so the UI gate and the driver check can't drift.
