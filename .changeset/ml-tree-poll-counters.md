---
"@milaboratories/pl-middle-layer": patch
---

`MiddleLayer.execCounters` also counts backend polls of each synchronized tree the middle layer opens: `project:<id>` for a project, `status:<project id>/<block id>/<mode>` for a block's status, and the role of every other tree. The `[exec-counters]` line lists the trees that polled in the period, so a project that keeps polling while idle shows up by name.
