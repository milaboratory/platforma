---
"@milaboratories/pl-tree": patch
"@milaboratories/pl-client": patch
---

Scale the tree-sync poll interval to the client's measured RTT instead of polling at a fixed interval regardless of link latency. Also exposes `PlClient.rttEstimateMs`. The configured interval remains the lower bound, so fast links are unaffected, and the derived floor is capped at 30s.
