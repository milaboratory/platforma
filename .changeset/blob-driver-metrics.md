---
"@milaboratories/pl-model-common": patch
"@milaboratories/pl-drivers": patch
---

Add `BlobDriverMetrics` and `DownloadDriver.getMetrics()`: uncached (sparse-cache-bypass) request volume, live in-flight download gauges, and presigned-URL cache efficiency (hits / misses / stale hits / fetch latency).
