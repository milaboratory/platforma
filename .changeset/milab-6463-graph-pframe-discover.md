---
"@platforma-sdk/model": patch
---

Fix "axes sets are disjoint" errors in graph PFrames. `getRelatedColumns` now gates its candidate columns through the spec-driver discover engine, dropping result-pool columns that share only a low-cardinality context axis (e.g. `pl7.app/sampleId`) with the block but are otherwise a disconnected column universe.
