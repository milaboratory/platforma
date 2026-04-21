---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
---

Add LinkerJoin query node (spec + data layers) mirroring OuterJoin's shape,
with a specialized linker sub-struct and a non-empty array of secondary join
entries. Introduces `PFrameWasmV3` whose `discoverColumns` returns
`DiscoverColumnsResponseV2` — each hit carries a ready-to-execute `SpecQuery`
that materializes the traversal path (plain column for direct hits, nested
`linkerJoin` chain for linker-path hits). V2 interfaces remain as legacy
shims pointing to V3 and will be removed in a future PFrames update.
