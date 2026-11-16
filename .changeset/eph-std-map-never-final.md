---
"@milaboratories/pl-client": patch
---

A tree no longer holds a ready `EphStdMap` final. An error that reaches the map after it is ready, such as the failed import of a v2 effect, now gets into the tree.
