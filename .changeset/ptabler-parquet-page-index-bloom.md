---
"@platforma-open/milaboratories.software-ptabler": minor
---

ptabler: emit Parquet Page Index, bloom filters on every column, `sorting_columns` and DataPage v2 from `WriteFrame`. Lets DataFusion's HashJoin DynamicFilter pushdown prune the right side of a left join at sub-row-group granularity (e.g. Lead Selection block on `pframes-rs`), and lets the UI's exact-match lookups skip pages on value columns too. Switches the writer from `duckdb COPY ... TO ...` (which does not emit the Page Index) to a streaming `pyarrow.parquet.ParquetWriter` fed by `duckdb_conn.execute(...).fetch_record_batch(...)`. Requires `pyarrow==24.0.0` — bloom-filter writing was only exposed to Python in PyArrow 24.
