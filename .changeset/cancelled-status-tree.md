---
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pl-model-middle-layer": patch
---

The block status tree of a cancelled run ends every node the stop left unfinished, with the reason `cancelled`, instead of leaving them in their last state.
