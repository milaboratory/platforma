---
"@platforma-sdk/workflow-tengo": minor
---

Add `pframes.build-query` — a tengo port of `pframes-rs`'s `BuildQuery`
request. Right-folds an ordered `path` of linker/filter steps over a
terminal column id into a `SpecQueryJoinEntry`, byte-identical on JSON
output to the wasm `pf-spec-driver.buildQuery` (cross-checked by tests).
Will be replaced with a wasm call once the backend exposes one.

`pframes.build-table.tpl.tengo` now drives its per-primary filter wrap
through `buildQuery`, translating the resulting `SpecQueryJoinEntry`
tree (`column`, `innerJoin`, `linkerJoin`) into pt operations.
