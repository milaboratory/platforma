---
"@milaboratories/pl-tree": patch
---

Make `PlTreeState.updateFromResourceData` 11% faster on a steady tree-sync poll and 23% faster on a first load, mainly by walking stored fields and kv entries in lockstep with the incoming ones instead of hashing every freshly decoded name.
