---
'@platforma-sdk/model': minor
'@platforma-sdk/ui-vue': patch
---

PlDataTable: persist column visibility as user deviations from block defaults

Column visibility reset when a block re-ran with a changed filter/ranking
configuration (MILAB-6002). The saved grid state stored the absolute
hidden-column set, which once present overrode the block's default visibility. A
column whose default flipped between runs — e.g. a filter/ranking column
reverting to `optional` when its filter is removed — stayed visible instead of
reverting to hidden.

Column visibility is now the user's explicit show/hide deviations from the
block's `pl7.app/table/visibility` default, so the current default always applies
to untouched columns. Persisted state migrates v7 -> v8: a one-time reset of
custom column show/hide, after which defaults apply correctly.

Adds `resolveColumnHidden` to the public model API — the shared default-vs-override
precedence used by the visible table handle and the grid — so this is a `minor` bump.

Also routes the deprecated `createPlDataTableV2` path through the shared
`computeHiddenColumns`, so the ~29 blocks still on it reconcile the same deviations (and
honour `shownColIds`) as the grid instead of misreading the lists as an absolute hidden
set — which over-included columns once visibility was customised.
