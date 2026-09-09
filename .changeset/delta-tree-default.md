---
"@milaboratories/pl-tree": patch
---

`auto` now resolves to the `backend-delta` algorithm whenever the backend advertises
`treeChangedSince:v1`, falling back to `backend-streaming` and then `client-bfs`.
