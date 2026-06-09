---
"@milaboratories/pl-model-middle-layer": patch
---

PFrames wasm: add self-contained `PFrameWasmAPIV5` factory and `PFrameWasmV4` per-frame interfaces. `PFrameWasmV4` adds `getColumn(columnId)` for O(1) single-column lookup by id; both `getColumn` and `listColumns` return `PColumnIdAndSpec` (the new interfaces drop `PColumnInfo`). These supersede the V4 factory / V3 per-frame interfaces and will replace them once the new PFrames build is adopted.
