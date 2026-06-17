---
"@milaboratories/pl-middle-layer": patch
---

Wire the persistent parquet blob cache into the PFrames remote blob provider, bumping `@milaboratories/pframes-rs-*` to 1.1.48 (which ships the caching runtime). Downloaded parquet byte ranges are now served from a local cache that survives restarts, backed by a new `parquetCachePath` (default `<workDir>/parquetCache`, not emptied on startup). Cache tuning is exposed via `parquetCacheOps` (defaults: 8 GiB budget, 0.2 single-file admission fraction, 50k tracked files), and `getCacheMetrics()` / `resetCache()` now report real data instead of `null` / no-op.
