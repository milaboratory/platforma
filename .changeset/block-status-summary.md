---
"@milaboratories/pl-model-common": patch
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

`Project.watchBlockStatus()` folds a block's action-context tree into a live `BlockStatusSummary`, with the run's jobs counted by where they are (copying input, queued, waiting for the cluster, running, done, failed), and the project tree prunes the action-context fields. `PlTreeNodeAccessor` gains `listKeyValues(prefix)` and `listFields()`.
