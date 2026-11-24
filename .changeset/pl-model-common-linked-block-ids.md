---
"@milaboratories/pl-model-common": minor
---

`linkedBlockIds(source, blockId)` lists the blocks the column links of a block name: the producers its args reference and the blocks below it whose args reference its outputs. It reads only the order of the blocks and their args, never a run.
