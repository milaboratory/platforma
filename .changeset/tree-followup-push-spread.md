---
"@milaboratories/pl-tree": patch
---

Fix a `RangeError: Maximum call stack size exceeded` in `loadTreeStateViaResourceTree` when a stop-marker follow-up round returns a very large number of resources, which left the synchronized tree permanently failing on every poll.
