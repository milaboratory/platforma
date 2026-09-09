---
"@milaboratories/pl-tree": patch
---

Remove the `USE_FINALISATION` const and its `PL_TREE_NO_FINALISATION` override. Frontier
seeding is required rather than optional, and the switch was a way to turn on a knowingly
lossy sync in a real process.
