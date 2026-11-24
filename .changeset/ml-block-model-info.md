---
"@milaboratories/pl-middle-layer": minor
---

`Project.getBlockModelInfo(blockId)` gives the feature flags and SDK version of a block's model as soon as the project holds its block pack, without waiting for the project overview, and `{ type: "absent" }` for a block the project does not have. The values match those of the block in the overview.
