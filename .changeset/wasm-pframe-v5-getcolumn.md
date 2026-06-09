---
"@milaboratories/pl-model-middle-layer": patch
---

PFrames internal API: add self-contained Vx+1 interfaces that supersede the current ones and will replace them once the new PFrames build is adopted.

- wasm: `PFrameWasmAPIV5` factory and `PFrameWasmV4` per-frame interface. `PFrameWasmV4` adds `getColumn(columnId)` for O(1) single-column lookup by id; both `getColumn` and `listColumns` return `PColumnIdAndSpec` (the new interfaces drop `PColumnInfo`).
- node: `PFrameReadAPIV15` read interface and `PTableV12` table view. `PTableV12.export` moves `headers` into `ops` as an ordered `[columnIndex, headerName][]` list instead of a positional `Record<number, string>` map.
