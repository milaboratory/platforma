---
'@milaboratories/pl-middle-layer': patch
---

block graph: if a direct dependency can be reached indirectly, remove it from dependencies. The problem is `contextresolver` controller wasn't expected loops in parents graph of contexts.
