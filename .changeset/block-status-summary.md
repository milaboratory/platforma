---
"@milaboratories/pl-model-common": patch
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

`Project.watchBlockStatus()` folds a block's action-context tree into a live `BlockStatusSummary`, and the project tree prunes the action-context fields. `PlTreeNodeAccessor` gains `listKeyValues(prefix)` and `listFields()`.
