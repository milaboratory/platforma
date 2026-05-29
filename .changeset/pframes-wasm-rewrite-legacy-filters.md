---
"@milaboratories/pl-model-middle-layer": minor
---

PFrame internal API: add `PFrameWasmAPIV4` — a self-contained WASM-spec factory that adds a stateless `rewriteLegacyFilters`, which upgrades selector-based legacy record filters into index-based data-layer boolean expressions for a given unified table spec (usable both for `getUniqueValues` and for composing a `filter` over a `table` query node). Also drop the `V2` suffix from the data-side create method on the (unreleased) `PFrameReadAPIV12`: `createTableV2` → `createTable`.
