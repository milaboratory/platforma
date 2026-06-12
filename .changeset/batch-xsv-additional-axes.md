---
"@platforma-sdk/workflow-tengo": minor
---

pframes.processColumn batch-mode Xsv outputs: two improvements.

- **Additional axes.** Batch Xsv outputs can now declare additional body-produced axes via `settings.axes`, alongside `settings.batchKeyColumns`. Previously the two were mutually exclusive, so a body that emitted new axes beyond the batch keys had no way to declare them (only ResourceMap outputs supported this). The combined output key is `[isolation…, batchKey…, additional…]`.

- **Honor `storageFormat`.** The batch path now respects the output's `storageFormat` (`Json` / `Binary` / `Parquet`) when building the partition / super-partition resources, matching the standard `processColumn` path. Previously it hardcoded Json super-partitioning, which (a) forced large outputs down pfconv's O(n²) single-partition Json import and (b) silently corrupted any output that requested `Parquet`/`Binary` (a `ParquetPartitioned` wrapped in a `JsonSuperPartitioned` container). The default is now `Parquet` (columnar, scales linearly); an unknown `storageFormat` is rejected with a clear error.
