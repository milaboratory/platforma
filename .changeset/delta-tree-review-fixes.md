---
"@milaboratories/pl-tree": patch
---

Fix the delta path skipping resources the mirror holds as final, which made a token-less poll
over a populated mirror throw and invalidate the tree. An unresolvable reference now raises
`TreeStateUpdateError` so the poll loop rebuilds instead of stalling forever, and
`usedStreaming` covers both backend paths so a delta tree no longer reports phantom BFS
waste.
