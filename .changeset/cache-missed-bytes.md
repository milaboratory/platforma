---
"@milaboratories/pl-model-middle-layer": patch
---

Add `bytesMissed` to cache counters: bytes requested by clients that were not cached, for measuring read-ahead amplification against `bytesFetched`.
