---
"@milaboratories/pl-tree": patch
---

Resolve the tree loading algorithm once, when a synchronized tree is created, instead of on
every poll. `resolveTreeLoadingAlgorithm` holds the `auto` rule and the fallbacks for a
preference the backend cannot serve; the tree logs the algorithm it will run and keeps it for
its life.
