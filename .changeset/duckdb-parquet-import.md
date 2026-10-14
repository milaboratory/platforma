---
'@platforma-open/milaboratories.software-ptabler': minor
'@platforma-sdk/workflow-tengo': minor
---

Add a DuckDB engine for Parquet PColumn imports, lifting the 2^32 row ceiling (MILAB-7195).

The Polars step chain the SDK emits for a Parquet import cannot read a file over 2^32
rows, because Polars indexes rows with a u32, so a long-format column that large fails
at import however it was batched. The new `import_parquet_frame` step does the whole
projection, cast, null filter and sort in one out-of-core DuckDB pass and hands the
result to `polars_pf.convert`, which `write_frame` already used for the write. Opt in
per import with `importEngine: "duckdb"`; it applies only to plain projection-and-cast
specs, and anything using preProcess, naRegex, filterOutRegex or an index axis keeps
the Polars chain.
