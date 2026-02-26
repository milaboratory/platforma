---
"@milaboratories/pl-tree": patch
"@milaboratories/pl-middle-layer": patch
---

Fix OOM crash when opening large projects by limiting concurrent gRPC fetches during tree loading. Warn on resources with excessive field count.
