---
"@milaboratories/pl-middle-layer": patch
---

`duplicateProject`: don't share in-flight production with the copy. When a
project was duplicated or shared while a block was still computing, the copy's
`prod*` fields were copied by reference, tying the copy to the source's live
computation.

Duplication now decides what production to copy by a cheap resource-level
readiness scan:

- nothing in flight (the common case) → copy all production as before;
- something in flight, with model access (an optional `ProjectHelper`, current
  schema) → drop the in-flight blocks **and their downstream closure**, so no
  finished block is left referencing a dropped upstream context;
- something in flight, without model access (sharing, CLI, or an unmigrated
  schema) → drop all production. Conservative but always chain-consistent.

Dropped blocks are also removed from `blocksInLimbo`. Callers that want the
precise closure (interactive duplicate / duplicate-to-user) pass their
`ProjectHelper`; others omit it and get the safe fallback.
