---
"@milaboratories/pl-tree": minor
"@milaboratories/pl-middle-layer": patch
---

`auto` now resolves to `backend-delta` whenever the backend advertises
`treeChangedSince:v1`, falling back to `backend-streaming` and then `client-bfs`. This
changes which algorithm an existing caller gets, without any change on their side.
`MI_TREE_TRAVERSAL` accepts `backend-delta` too.
