---
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pf-driver": patch
---

Prepare pf-driver for the next pframes-rs-node addon revision.

- Declare V5 addon interfaces (`PFrameFactoryAPIV5`, `PTableV9`,
  `PFrameReadAPIV12`, `PFrameV14`, `PFrameFactoryV5`) alongside the V4
  ones so the next addon publish has a concrete TS contract to
  implement. The current V4 surface is unchanged.
- Cache the WASM-spec frame on `PFrameHolder` and route
  `driver.findColumns`, `getColumnSpec`, `listColumns` through it
  instead of round-tripping through the addon. `getColumnSpec` and
  `listColumns` now return only value-typed columns — the queryable
  subset that exec can plan against.
- Lower V1 `createPTable` inputs via WASM-spec at construction time
  and unify the def shape: `FullPTableDef` is now flat
  `{ pFrameHandle, tableSpec, dataQuery }` for both V1 and V2 entry
  points. The recursive sort/filter peeling in `createNewResourceV1`
  is dropped; the existing `createTableV2` path materialises the
  lowered query end-to-end.
- Switch the `driver.getSpec` PTable read to a JS-side lookup from the
  cached def — no addon roundtrip.

After this PR every existing V4 addon call still works; pf-driver
just stops needing several of them. The remaining cutover (drop V4
interface declarations, switch to V5 addon calls, send pre-resolved
indices for `getUniqueValues`, bulk `addColumns`) lands in a follow-up
once the addon publishes V5.
