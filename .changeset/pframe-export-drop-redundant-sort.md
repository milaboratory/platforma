---
"@platforma-sdk/workflow-tengo": patch
---

Drop the redundant axis sort from the PFrame export paths (`xsv.exportFrame`, `tableBuilder.build()`). The `read_frame` source is already sorted by its full axis tuple (the PFrame primary key) per the pframes-rs PTable contract, so the extra `sort` step only added a pipeline-breaker. Because the Polars source is a non-spillable io-source generator, that sort materialized the whole frame in memory and OOMed on large exports (billions of rows). Removing it makes these exports stream with bounded memory; output order is unchanged (`select`/`save` preserve row order, and the unique axis key leaves no ties).
