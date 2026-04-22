---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
---

Add LinkerJoin query node (spec + data layers) mirroring OuterJoin's shape,
with a specialized linker sub-struct and a non-empty array of secondary join
entries. Introduces `PFrameWasmV3` adding `buildQuery`: a pure spec-layer
assembler that turns a terminal column plus an ordered path of wrapping
steps (linker hops, filter joins) into a ready-to-compose
`SpecQueryJoinEntry`. Extends `DiscoverColumnsStepInfo` with a `filter`
variant and adds `BuildQueryInput` in `pl-model-common`. V2 interfaces
remain as legacy shims pointing to V3 and will be removed in a future
PFrames update.
