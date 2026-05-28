---
"@milaboratories/pl-model-middle-layer": minor
---

PFrames PTableV9: remove `filter` / `sort` methods from the interface.

`PTableV9` previously declared `filter(tableId, request: PTableRecordFilter[])`
and `sort(tableId, request: PTableSorting[])`, both taking spec-based
selectors. Implementing those would force `pframes-rs-node` to either keep
a JS-side spec→data adapter or retain `pframes_rs_spec` in its exec crate
purely to translate filter / sort selectors — defeating the broader effort
to push selector resolution to the caller side via WASM-spec.

The cleaner cut, made now while `V9` is still pre-adoption: drop the two
methods. Callers compose filtering and sorting into the input `DataQuery`
of the next `createTableV2` call (via `QueryData::Filter` / `Sort` over a
`QueryData::Table` leaf) — exactly the same vocabulary already used by
`getUniqueValues` V2.

No production caller depends on `V9.filter` / `.sort` yet (the interface
shipped with PR #1658 but hasn't been adopted). `PTableV8` retains both
methods unchanged.
