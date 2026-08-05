---
"@milaboratories/pl-middle-layer": patch
---

Drop the dependency on the pframes spec-plane wrapper. The package declared this
dependency, but no code imported it.
