---
"@milaboratories/pl-middle-layer": patch
---

`duplicateProject`: don't share still-running production with the copy. When a
project was duplicated or shared while a block was still computing, the copy's
`prod*` fields were copied by reference, tying the copy to the source's live
computation.

Duplication now copies only *settled* production and decides what to drop by a
cheap resource-level scan:

- nothing running (the common case) → copy all production, including
  finished-error blocks (sharing a failed project is a valid use-case);
- something running, with model access (an optional `ProjectHelper`, current
  schema) → drop the running blocks **and their downstream closure**, so no
  finished block is left referencing a dropped upstream context;
- something running, without model access (sharing, CLI, or an unmigrated
  schema) → drop all production. Conservative but always chain-consistent.

Callers that want the precise closure (interactive duplicate / duplicate-to-user)
pass their `ProjectHelper`; others omit it and get the safe fallback.
