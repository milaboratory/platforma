---
"@milaboratories/pl-tree": patch
---

Cap the tree-sync stop-marker follow-up request at `maxDepth: 0`

The follow-up round that resolves stop-marked resources could not reapply the
traversal stop rules (they would re-flag the seeds themselves), so it traversed
without any cap and the server streamed each seed's entire subtree. Every
already-final descendant was then discarded on arrival, making the whole
transfer pure waste.

The follow-up now fetches only the seeds' own state and expands one level per
round into referents the client does not already hold — the same predicate the
client-side BFS path uses.

On a 7-block project against a remote backend, the tree poll that follows a block
reorder dropped from 2096 streamed frames (2041 of them discarded) at 1231 ms, to
55 frames with none discarded at 227 ms. `Project.reorderBlocks` — the pl
transaction plus one tree refresh — went from ~1660 ms to ~580 ms.

That is the mutation call, not the settle the user sees: a reorder additionally
re-renders the block's outputs once per staging generation, which dominates and is
unaffected by this change.
