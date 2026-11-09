---
"@milaboratories/pl-model-common": patch
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

`Project.watchBlockStatus()` folds a block's action-context tree into a live `BlockStatusSummary`, with the run's jobs counted per state as the backend reports it, one computable per context so a report re-reads only its own context, and the project tree prunes the action-context fields. `PlTreeNodeAccessor` gains `listKeyValuesAsString(prefix)` and `listFields()`.
