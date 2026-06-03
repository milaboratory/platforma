---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pf-driver": minor
"@platforma-sdk/ui-vue": patch
---

Add `PFrameDriver.exportPTable(handle, { path, columnIndices })` — exports the table to a file natively via `PTableV10.export`, selecting the format from the `path` extension (`csv`/`tsv`/`parquet`/`xlsx`). `columnIndices` selects the columns to export; column headers are derived on the driver side from each field's label annotation (falling back to its spec name), the same way `writePTableToFs` builds CSV/TSV headers. For `xlsx`, the driver checks the table shape and rejects exports whose data rows exceed the 1,000,000-row per-sheet limit (below Excel's hard cap of 1,048,576). The driver currently voids `columnIndices` and exports the full table — it will be honoured once the `PTableV11` native update lands.

Add the next PFrames addon interface version — `PFrameFactoryV7` / `PFrameV16` / `PFrameReadAPIV14` / `PTableV11` — where `PTableV11.export` takes `headers` as a `Record<number, string>` (unified column index → header name) that both selects the columns to export (its keys) and names them (its values), instead of a positional `string[]`. The current `V6`/`V15`/`V13`/`V10` surface is unchanged and still used by the driver; the new version is defined ahead of its PFrames implementation, after which the monorepo will migrate and drop the old one.

`PlAgCsvExporter` no longer hardcodes the output format — it offers the available formats as save-dialog file-type filters and derives the format from the chosen path. When the runtime advertises `exportPTable` it exports the visible table handle directly (`csv`/`tsv`/`parquet`/`xlsx`, no gzip); otherwise it falls back to `writePTableToFs` (`csv`/`tsv`, plain or gzip-compressed depending on the chosen `.gz` extension).
