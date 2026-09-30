---
"@milaboratories/pl-tree": minor
"@milaboratories/pl-client": patch
---

pl-tree defect fixes: readers are notified when a resource becomes final (B1), when a lock
changes (B4), when a required field appears (B8) and when a Dynamic or MTW field comes back
under another type (B11); any error inside an update rebuilds the tree (B2), and repeated
rebuilds back off from 100 ms to 5 s instead of re-reading in a hot loop (B3); a deleted root
leaves the tree (B7, new `rootsNeverFinal` option to check final roots too); a dynamic field
removal re-evaluates finality (B9); `listDynamicFields` no longer lists Service fields (B10,
block-visible); the backend `final` flag follows updates (B12); common traversal options reach
`getField` (B13); data getters enforce the usage guard (B14).

pl-client: the StreamManager finality predicate returns "not final" instead of throwing when
its fields are absent.
