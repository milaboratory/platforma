---
"@milaboratories/pl-model-common": patch
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

Live block status for the Desktop App. `Project.watchBlockStatus()` opens a synchronized tree at the block's root status context and folds it into a `BlockStatusSummary`: counters by state over live nodes, which of them holds the block, and the engine's reason when the run ended in a failure. Watches are reference counted and re-seed themselves when the block is run again. The project tree now prunes the status fields, so status reports no longer move its change generation. `PlTreeNodeAccessor` gains `listKeyValues(prefix)` and `listFields()`, for a reader whose keys and fields are not known in advance; the KV key-set change source is keyed by prefix, so a reader of one prefix is not woken by writes under another.
