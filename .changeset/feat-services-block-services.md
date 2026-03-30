---
"@milaboratories/pl-model-common": minor
"@milaboratories/pf-spec-driver": minor
"@milaboratories/pf-driver": minor
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
"@platforma-sdk/test": minor
---

Add block-level services infrastructure (PFrameSpec, PFrame)

- Introduce `Services` registry in pl-model-common with service definitions, feature flags, and typed driver interfaces
- Add `PFrameSpec` service: synchronous WASM-based spec operations (createSpecFrame, discoverColumns, evaluateQuery, disposeSpecFrame)
- Wire services through block model, plugin model, and UI layers with compile-time `RequireServices` constraints
- Add `ColumnCollection` with `dispose()` for deterministic spec frame cleanup
- Add `createPlDataTable` v3 API using `ColumnCollectionBuilder` with include/exclude column selectors
- Move pf-spec-driver logging before WASM calls for better crash diagnostics
- Fix outputWithStatus in plugin model
- Fix table row selection not propagating to selection model
