---
"@platforma-open/milaboratories.software-ptabler": major
"@platforma-sdk/workflow-tengo": major
---

ptabler: emit Parquet Page Index, bloom filters on every column, `sorting_columns` and DataPage v2 from `WriteFrame`. Lets DataFusion's HashJoin DynamicFilter pushdown prune the right side of a left join at sub-row-group granularity (e.g. Lead Selection block on `pframes-rs`), and lets the UI's exact-match lookups skip pages on value columns too. Switches the writer from `duckdb COPY ... TO ...` (which does not emit the Page Index) to a streaming `pyarrow.parquet.ParquetWriter` fed by `duckdb_conn.execute(...).fetch_record_batch(...)`. Requires `pyarrow==24.0.0` — bloom-filter writing was only exposed to Python in PyArrow 24.

`Stats.numberOfBytes` semantics changed to be data-only (`SUM(LENGTH(CAST(col AS BLOB)))` over written rows) instead of `total_uncompressed_size` from the parquet column chunk. Identical data now produces identical `numberOfBytes`, regardless of writer encoder settings. **Breaking** for any consumer that compared raw byte numbers across writer versions; `dataDigest` is unaffected (content-only).

`@platforma-sdk/workflow-tengo` is bumped major because the `:pt` module's templates (`pt.import-dir`, `pt.workflow-run`, transitively `pt/index.lib`) call ptabler. Their on-disk output bytes change with this ptabler version, so any downstream block that pinned a workflow-tengo template hash must repin against the new version to avoid CID drift against cached artifacts.
