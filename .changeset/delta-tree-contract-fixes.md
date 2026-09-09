---
"@milaboratories/pl-client": minor
"@milaboratories/pl-tree": minor
---

Delta polling now warns when it is handed `traverseStopRules` it will not send on a token-less
poll, and when a token poll comes back the size of the whole mirror, which is what a
server-refused token looks like from the client. The stop-marker frame discriminant is
narrowed to `traverseWasStopped`, so a future body-less frame kind is skipped rather than
re-fetched.
