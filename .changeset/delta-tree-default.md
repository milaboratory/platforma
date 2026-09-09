---
"@milaboratories/pl-tree": minor
---

`auto` now resolves to the `backend-delta` algorithm whenever the backend advertises
`treeChangedSince:v1`, falling back to `backend-streaming` and then `client-bfs`. This
changes which algorithm an existing caller gets, without any change on their side.
