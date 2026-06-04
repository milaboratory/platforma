---
"@platforma-open/milaboratories.software-ptabler": minor
---

ReadCsv / ReadNdjson / ReadParquet now accept a `raiseIfEmpty` option. When set to `false` and the input file is zero bytes, the step synthesises an empty `LazyFrame` from the declared `schema` instead of raising polars `NoDataError`. Defaults to `true` (existing strict behaviour). Use this together with a complete `schema` listing every column referenced downstream, so the empty frame has the right shape for subsequent `withColumns` / `filter` calls.
