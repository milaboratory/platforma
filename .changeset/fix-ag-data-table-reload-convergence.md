---
"@platforma-sdk/ui-vue": patch
---

Make `PlAgDataTableV2`'s reload comparison converge by construction, and drop
the burst limit that was standing in for it.

The comparison decides whether to destroy and rebuild the grid around the stored
state, so it must only ask for things a rebuild can deliver. It was asking for
two kinds of thing that no rebuild can: a field the stored state does not
express (AG Grid always reports its whole state), and an id the grid does not
have — state outlives column sets, so a sort on a column a later run dropped, or
hidden ids saved against different columns, could never be satisfied. Either one
turned the watch into an engine for endless rebuilds.

Both are now filtered out before comparing: the stored state is reduced to the
columns the grid actually has, and only the fields it still expresses are
compared. A stored column order is judged on the relative order of the columns
it names, so where the grid puts the rest is not a disagreement, and the hidden
set is compared as a set.

With the comparison unable to ask for the impossible, the "give up after three
reloads a second" limit is gone: it capped the damage of a non-converging
comparison rather than making one converge, and it would have hidden the next
such bug instead of surfacing it.
