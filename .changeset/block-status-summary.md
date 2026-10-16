---
"@milaboratories/pl-model-common": patch
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

Live block status for the Desktop App. `Project.watchBlockStatus()` opens a synchronized tree at the block's root status context and folds it into a `BlockStatusSummary`: live nodes by state, the state holding the most of them as one line, and the engine's reason when a node terminated. The watch re-seeds itself when the block is run again, and the project tree now prunes the status fields so status reports no longer churn the project overview. `PlTreeNodeAccessor` gains `listKeyValues(prefix)` and `listFields()`, for a reader whose keys and fields are not known in advance.
