---
"@milaboratories/pl-client": patch
---

A tree no longer holds a ready `EphStdMap` with fields final, so an error that reaches the map after it is ready gets into the tree. Before, the failed import of a v2 effect could stay invisible to the reader for as long as it polled. A ready map with no fields stays final.
