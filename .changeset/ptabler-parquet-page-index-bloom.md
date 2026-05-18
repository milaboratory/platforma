---
"@platforma-open/milaboratories.software-ptabler": minor
---

ptabler: emit Parquet Page Index, axis bloom filters, sorting_columns and DataPage v2 from `WriteFrame`. Lets DataFusion's HashJoin DynamicFilter pushdown prune the right side of a left join at sub-row-group granularity (e.g. Lead Selection block on `pframes-rs`), instead of reading the full join-key column chunk. Switches the writer from `duckdb COPY ... TO ...` (which does not emit the Page Index) to a streaming `pyarrow.parquet.ParquetWriter` fed by `duckdb_conn.execute(...).fetch_record_batch(...)`. Requires `pyarrow==24.0.0` — bloom-filter writing was only exposed to Python in PyArrow 24.
