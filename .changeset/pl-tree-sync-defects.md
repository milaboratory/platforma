---
"@milaboratories/pl-tree": minor
"@milaboratories/pl-client": patch
"@milaboratories/pl-middle-layer": patch
---

pl-tree defect fixes: readers are notified when a resource becomes final, when a lock changes,
when a required field appears and when a Dynamic or MTW field comes back under another type;
any error while applying an update invalidates the mirror and raises `TreeStateUpdateError`, so
the synchronization loop rebuilds it, and consecutive rebuilds back off from 100 ms to 5 s; a
deleted root leaves the tree (new `rootsNeverFinal` option to existence-check roots the
predicate calls final too); a dynamic field removal re-evaluates finality; `listDynamicFields`
excludes Service fields (visible to blocks); the backend `final` flag follows updates; common
traversal options reach `getField`; data getters and `getKeyValueAsJson` enforce the usage
guard. Also: an unresolved or absent field of a final resource reads as stable; invalidation
re-runs readers waiting for a resource the tree does not hold; `terminate()` rejects pending
`refreshState()` calls; the streaming loader passes the backend `final` flag through as sent,
whether or not the traversal stopped at the resource.

pl-client: for a non-errored StreamManager whose field list lacks `stream` or `downloadable`, or
has `stream` still empty, the finality predicate returns false and does not throw.
