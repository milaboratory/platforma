---
"@milaboratories/pl-client": patch
---

Carry the delta tree change token through `PlTransaction`. `getNextSinceToken()` returns the
token the transaction was opened at, and `resourceTree()` accepts `changedSinceToken` plus
`unconditionalDepth` to poll with it and to read back what a delta referenced but did not
send. `traverseStopRules` is deprecated, and does not apply under a token.
