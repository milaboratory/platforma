---
"@milaboratories/pl-model-common": minor
"@milaboratories/pf-spec-driver": minor
"@milaboratories/pl-middle-layer": patch
---

Expose `buildQuery` and `listColumns` on `PFrameSpecDriver`:

- `buildQuery(input: BuildQueryInput): SpecQueryJoinEntry` — pure
  spec-layer assembler that turns a terminal column plus an ordered
  path of wrapping steps (linker hops, filter joins) into a
  ready-to-compose `SpecQueryJoinEntry`. No frame handle is required
  (wires directly to the top-level export from `pframes-rs-wasm`).
- `listColumns(handle: SpecFrameHandle): PColumnInfo[]` — enumerates
  every column registered in the spec frame. `hasData` is always
  `false` for spec-only frames.

Both are also routed through the QuickJS service injector, so block
models can call `ctx.services.pframeSpec.buildQuery(...)` and
`ctx.services.pframeSpec.listColumns(handle)`.

Bumps `@milaboratories/pframes-rs-wasm` to 1.1.26 (corrected V3:
`buildQuery` at top level, `listColumns` on the frame resource). The
pool type switches from `PFrameWasmV2` to `PFrameWasmV3`.
