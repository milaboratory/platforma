---
"@milaboratories/pl-middle-layer": minor
---

Stop giving every watched block its own copy of the project-overview state tree

`Project.getBlockComputables` built each block's state computable with the whole
`projectOverview` computable embedded as a child, then wrapped it in
`withPreCalculatedValueTree()`. Because that pre-calculation eagerly builds the entire value
tree, **each watched block got a private cell-state tree for the overview** — and every copy
independently re-executed every block's `sections`, `title` and `subtitle` model lambdas. Each
of those spins up a QuickJS runtime and re-parses the block's 276–480 KB model bundle, so the
cost grew as O(blocks²).

All of that bought a single value: the watched block's `sdkVersion`, used to decide whether
output errors need converting to strings for old blocks. It is now read directly from that one
block's pack.

Measured on a 6-block project, per user edit: overview lambda executions **60 → 20**, QuickJS
contexts **123 → 83**, bundle evaluation **2,153 ms → 1,460 ms**. Blocks whose data did not
change now run their lambdas once instead of three times. The saving grows with project size.

`projectOverview` also now takes an explicit, stable computable key instead of an
auto-assigned ephemeral one, so its state survives by key if it is ever embedded as a child
again, and so it is identifiable in the computable debug logs.
