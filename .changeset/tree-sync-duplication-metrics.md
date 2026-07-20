---
"@milaboratories/pl-tree": patch
---

Add cross-cycle duplication counters to tree-sync stats (MI_LOG_TREE_STAT): new/changed/unchanged resources, wasted downlink bytes, BFS fetches spent on unchanged resources, and changes that re-streamed stable metadata. Quantifies how much of each poll re-fetches resources the client already holds.
