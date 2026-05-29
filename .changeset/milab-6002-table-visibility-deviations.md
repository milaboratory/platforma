---
'@platforma-sdk/model': patch
'@platforma-sdk/ui-vue': patch
---

PlDataTable: persist column visibility as user deviations from block defaults

Fixes column visibility resetting when a block re-runs with changed filter/ranking
configuration (MILAB-6002). The saved grid state previously stored the absolute
hidden-column set, which overrode the block-defined default visibility once it
existed — so a column whose default flipped between runs (e.g. a filter/ranking
column reverting to optional after the filter was removed) was not re-hidden.

Column visibility is now stored as the user's explicit show/hide deviations from
the block's `pl7.app/table/visibility` default. The current default always applies
to untouched columns, and the block's full/visible table handles reconcile the same
way. Persisted state is migrated v7 -> v8 (one-time reset of custom column
show/hide; defaults apply correctly afterwards).
