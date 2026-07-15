---
"@milaboratories/pl-middle-layer": patch
---

`duplicateProject`: don't share in-flight production with the copy. When a
project was duplicated or shared while a block was still computing, the copy's
`prod*` fields were copied by reference, tying the copy to the source's live
computation.

The copy now shares production only when the whole project's production is
cleanly `Ready`. The decision is all-or-nothing: if any block is not Ready
(running, errored, or partial), no production is copied and the copy re-derives
from scratch, with `blocksInLimbo` cleared. This preserves the core invariant
that a finished block has a consistent upstream chain — dropping one running
block's production while keeping a finished downstream block would leave that
downstream referencing an absent upstream context. When every block is Ready,
production (including limbo state) is copied by reference as before.
