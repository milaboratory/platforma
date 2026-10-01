---
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": patch
---

Gate delta tree sync on `treeChangedSince:v2`. v1 backends emit body-less unchanged frames the client misreads as stop markers, flooding the log; until a backend advertises v2 the tree falls back to backend-streaming.
