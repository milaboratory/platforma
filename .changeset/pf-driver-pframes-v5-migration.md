---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pf-spec-driver": minor
"@milaboratories/pf-driver": minor
"@milaboratories/pl-middle-layer": minor
---

Migrate pf-driver to the pframes-rs 1.1.38 V5 addon surface.

- Bump `@milaboratories/pframes-rs-{node,wasip2,wasm}` to `1.1.38`.
- `pf-driver` switches off the V4 addon API: `createTableV2({ tableSpec, dataQuery })` → `createTable(dataQuery)`, the per-column `addColumnSpec`/`setColumnData` loop → a single bulk `addColumns(...)`, and `getUniqueValues` now sends pre-resolved indices (`UniqueValuesRequestV2`) — axis indices via `expandAxes` + `findTableColumn`, filters via WASM-spec's stateless `rewriteLegacyFilters`. `params.tableSpec` is retained on the JS-side cache only.
- `pl-model-middle-layer` drops the obsolete V4-era `PFrameInternal` interfaces (`PFrameFactoryAPIV4`, `PFrameReadAPIV11`, `PTableV8`, `PFrameV13`, `PFrameFactoryV4`); the published addon now implements `PFrameV14`/`PFrameFactoryV5`.
- `pf-spec-driver` / `pl-model-common` expose `rewriteLegacyFilters` on `PFrameSpecDriver` (wired through the service registry and workflow VM bridge).
