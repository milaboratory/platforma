---
"@platforma-sdk/model": minor
---

Add `getNumberOfRows(data)` helper returning a PColumn's row count as `number | undefined`. Sums per-chunk `stats.numberOfRows` for `ParquetPartitioned` columns (no blob download) and counts entries for inline `Json` / `PColumnValues` data; returns `undefined` for `JsonPartitioned`/`BinaryPartitioned`, when data is still computing, or when any parquet chunk lacks the stat.
