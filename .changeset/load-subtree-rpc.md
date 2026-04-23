---
"@milaboratories/pl-client": minor
"@milaboratories/pl-tree": minor
"@milaboratories/pl-middle-layer": minor
---

Use server-side `ResourceAPI.LoadSubtree` for tree synchronization when the backend advertises the `loadSubtree:v1` capability. This collapses a multi-round-trip client-driven BFS into a single RPC, making project open and post-mutation refresh roughly proportional to one RTT regardless of graph depth. Falls back transparently to the existing client-driven loader on older backends.
