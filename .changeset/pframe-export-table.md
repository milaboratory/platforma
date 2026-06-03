---
"@milaboratories/pl-model-common": minor
"@milaboratories/pf-driver": minor
---

Add `PFrameDriver.exportPTable(handle, path)` — exports the full, sorted table to a file natively via `PTableV10.export`, selecting the format from the file extension (`csv`/`tsv`/`parquet`/`xlsx`). Column headers are derived on the driver side from each field's label annotation (falling back to its spec name), the same way `writePTableToFs` builds CSV/TSV headers, so callers only supply the destination path. For `xlsx`, the driver checks the table shape and rejects exports that would exceed the 1,000,000-row per-sheet limit (including the header row; below Excel's hard cap of 1,048,576).
