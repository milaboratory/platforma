---
'@platforma-open/milaboratories.software-ptabler': minor
'@platforma-sdk/workflow-tengo': minor
---

Add a DuckDB engine for Parquet PColumn imports, lifting the row ceilings that kept
large long-format columns from importing at all (MILAB-7195).

Polars indexes rows with a u32, so the step chain the SDK emits for a Parquet import
refuses any file over 2^32 rows. The new `import_parquet_frame` step does the
projection, cast, null filter and sort in one out-of-core DuckDB pass and hands the
result to `polars_pf.convert`, which `write_frame` already used for the write. Opt in
per import with `importEngine: "duckdb"`; it covers plain projection-and-cast specs,
and anything using preProcess, naRegex, filterOutRegex or an index axis keeps the
Polars chain.

Two further limits sit behind that one and are also addressed. DuckDB's sort keeps
per-thread buffers, so the thread count is now derived from the memory budget rather
than the core count. Parquet stores a row group's ordinal as an i16, capping a file
at 32767 groups, so the row group size is derived from the row count; frames that fit
the default are unchanged. Because sorting at this size is expensive in scratch, the
step first checks whether the input is already ordered by its axes and streams
straight through when it is.

`write_frame` picks up the same sort tuning, since it issues the same ORDER BY.
