---
"@milaboratories/pl-tree": minor
---

`SynchronizedTreeState.onResourcesOfType(prefix, listener)` reports the resources whose type starts with the prefix: those the mirror already holds at once, then those each refresh adds or changes. Subscribing does not start or keep polling. `PlTreeState.resourcesOfType` lists them.
