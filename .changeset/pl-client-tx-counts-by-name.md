---
"@milaboratories/pl-client": patch
---

PlClient counts transaction attempts by name and outcome (committed, closed without commit, conflict, error) in `txCountsByName`, and `PlTransaction.committed` tells whether a write transaction's commit was accepted.
