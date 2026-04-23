---
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-model-common": patch
"@milaboratories/pf-spec-driver": patch
---

Correct `PFrameWasmV3` shape:

- Move `buildQuery` from the per-frame interface to the API factory
  (`PFrameWasmAPIV3`). It is pure over its input and does not consult
  frame state, so it should not require a frame instance.
- Add the missing `listColumns(): PColumnInfo[]` on the per-frame
  interface, mirroring `PFrameReadApi.listColumns` on the data layer.

`PFrameWasmV2` / `PFrameWasmAPIV2` are kept as legacy shims until the V3
surface is implemented on the pframes-rs side and `pframes-rs-wasm`
stops returning V2 from its top-level exports.

Requires a matching `pframes-rs-wasm` release that exposes `buildQuery`
as a top-level export and `listColumns` on the frame resource.
