---
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pl-model-middle-layer": patch
---

Stop building the block storage debug view in the project overview and the block state. It evaluated the model bundle of every Model API v2 block in a new QuickJS VM on each overview update, which blocked the middle layer for about 3 s per edit in a 36-block project. `storageDebugView` is now deprecated and left undefined; debug tools read `blockStorage`.
