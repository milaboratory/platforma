---
"@milaboratories/pl-tree": patch
---

Instrument tree-sync stats (MI_LOG_TREE_STAT) for full introspection: cross-cycle duplication (new/changed/unchanged resources, wasted downlink bytes, stable-metadata re-streams), per-path detail (streaming rounds/frames/stop-markers, BFS requests and not-found), and a breakdown of what changed each cycle (fields, kv, ready, locks, finalization). The resourceTree stop-marker follow-up now loops until every stop-marker seed is resolved (deduping fetched ids), so deep trees fully load instead of leaving referenced resources as orphans. KV additions, modifications, and deletions now mark the resource changed, so they bump dataVersion, re-evaluate finality, and are counted correctly.
