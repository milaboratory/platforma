---
"@milaboratories/pl-model-middle-layer": patch
"@milaboratories/pf-driver": patch
"@milaboratories/pl-middle-layer": patch
---

Add the caching object store contract to `PFrameInternal`: `CacheConfig`, `CacheCounters`, `CacheMetrics`, `CachingObjectStore`, `CachingObjectStoreOptions`, and `HttpHelpers.createCachingObjectStore`. These declare the type surface for a persistent byte-range cache that wraps an upstream `ObjectStore` and exposes metrics/reset/disposal; the runtime implementation lands in `@milaboratories/pframes-rs-node`. The reserved caching slot is dropped from `RequestHandlerOptions` — caching is composed by wrapping the store before it reaches the request handler.

Wire `getCacheMetrics()` / `resetCache()` through the driver: declared on `AbstractInternalPFrameDriver` alongside `pprofDump`, added to the internal `RemoteBlobProvider` interface, and delegated from `AbstractPFrameDriver` to its remote blob provider. Until the cache is wired into the parquet object store, both the production and test-double providers return `null` metrics and treat reset as a no-op.
