---
"@milaboratories/pl-tree": patch
---

Build each delta frame's resource as an explicit object literal rather than two rest-spreads,
which measured ~15% off the per-frame cost.
