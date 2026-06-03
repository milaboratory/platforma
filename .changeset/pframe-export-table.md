---
"@milaboratories/pl-model-common": minor
"@milaboratories/pf-driver": minor
"@platforma-sdk/ui-vue": patch
---

Add `PFrameDriver.exportPTable(handle, path)` — exports the full, sorted table to a file natively via `PTableV10.export`, selecting the format from the file extension (`csv`/`tsv`/`parquet`/`xlsx`). Column headers are derived on the driver side from each field's label annotation (falling back to its spec name), the same way `writePTableToFs` builds CSV/TSV headers, so callers only supply the destination path. For `xlsx`, the driver checks the table shape and rejects exports that would exceed the 1,000,000-row per-sheet limit (including the header row; below Excel's hard cap of 1,048,576).

`PlAgCsvExporter` now prefers `exportPTable` when the runtime advertises it, exporting the visible table handle directly (no gzip, format from the file extension). When it is unavailable it falls back to the previous gzip-compressed `writePTableToFs` path for `csv`/`tsv`; `parquet`/`xlsx` require native export.
