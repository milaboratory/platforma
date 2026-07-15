---
"@milaboratories/pl-middle-layer": patch
---

`duplicateProject`: don't share in-flight production with the copy. When a
project was duplicated or shared while a block was still computing, the copy's
`prod*` fields were copied by reference, tying the copy to the source's live
computation.

The copy now drops production for every block that is not cleanly `Ready`
(running, errored, or partial) **and its whole downstream closure**, clearing
those blocks from `blocksInLimbo`. Ready blocks that are not downstream of an
in-flight block keep their production, so duplicating an idle or fully-finished
project is unaffected. The downstream closure is required to preserve the core
invariant that a finished block has a consistent upstream chain: a finished
block's `prodCtx` is built from its upstreams' `prodCtx`, so dropping a running
upstream while keeping a finished downstream would leave the downstream
referencing an absent upstream context.

Readiness and the dependency graph are read from the source project's mutator,
so `duplicateProject` now takes a `ProjectHelper` (threaded through
`buildShareEnvelope` and `copyEnvelopeProjectsIntoList`).
