---
"@milaboratories/pl-tree": minor
"@milaboratories/pl-client": patch
"@milaboratories/pl-middle-layer": patch
---

pl-tree defect fixes: readers are notified when a resource becomes final (B1), when a lock
changes (B4), when a required field appears (B8) and when a Dynamic or MTW field comes back
under another type (B11); any error while applying an update invalidates the mirror and raises
`TreeStateUpdateError`, so the synchronization loop rebuilds it (B2), and repeated
rebuilds back off from 100 ms to 5 s instead of re-reading in a hot loop (B3); a deleted root
leaves the tree (B7, new `rootsNeverFinal` option to check final roots too); a dynamic field
removal re-evaluates finality (B9); `listDynamicFields` no longer lists Service fields (B10,
block-visible); the backend `final` flag follows updates (B12); common traversal options reach
`getField` (B13); data getters and `getKeyValueAsJson` enforce the usage guard (B14).
Also: an unresolved or absent field of a final resource reads as stable; invalidation re-runs
readers waiting for a resource the tree does not hold; `terminate()` rejects pending
`refreshState()` calls; the streaming loader no longer reports a stopped traversal as
backend-final.

pl-client: for a non-errored StreamManager whose field list lacks `stream` or `downloadable`, or
has `stream` still empty, the finality predicate returns "not final" instead of throwing or
claiming a switch.
