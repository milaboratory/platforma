---
"@milaboratories/pl-middle-layer": patch
---

`duplicateProject`: don't share in-flight production with the copy. When a
project was duplicated or shared while a block was still computing, the copy's
`prod*` fields were copied by reference, tying the copy to the source's live
computation. Now `prodOutput`/`prodCtx`/`prodUiCtx`/`prodArgs` are copied only
when the block's production is `Ready` (immutable, complete); otherwise they are
skipped so the copy re-derives independently. Mirrors the readiness gate
`duplicateBlock` already applies via `getFieldNamesToDuplicate`.
