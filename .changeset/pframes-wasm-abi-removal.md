---
"@milaboratories/pl-model-middle-layer": minor
---

Remove the `PFrameInternal.PFrameWasm*` interfaces and `EvaluateQueryResponse`

`PFrameWasmAPIV2`–`V5` and `PFrameWasmV2`–`V4` described the spec-plane WASM surface. The
SDK used these interfaces to work with the pframes version that a host shipped. The SDK
negotiated that version across a package boundary that had its own version. That boundary
is now gone. The implementation is in `@milaboratories/pf-spec`, and the two packages
release together. Use the `PFrame` type from that package instead.

Four of the seven interfaces had no consumers.

This change also removes `EvaluateQueryResponse`, because it is a duplicate.
`@milaboratories/pl-model-common` already declares an identical type for the
`PFrameSpecDriver` contract.

`LegacyQuery` moves to `@milaboratories/pf-spec`, next to the method that accepts it.
