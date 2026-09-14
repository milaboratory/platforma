---
"@milaboratories/pf-driver": patch
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pf-spec": patch
"@platforma-sdk/workflow-tengo": patch
"@platforma-open/milaboratories.software-ptabler": patch
---

Update pframes-rs-node, pframes-rs-wasip2, and polars-pf to 1.1.60. Wide tables with hundreds of same-axis columns no longer overflow the engine thread stack (balanced join fold).
