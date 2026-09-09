---
"@milaboratories/pl-tree": patch
---

Add the `backend-delta` tree loading algorithm: it hands the backend the change token its
transaction was opened at and takes only the resources that changed since, resolving
references a delta pointed at but did not carry. Reachable via `traversalMode:
"backend-delta"`; `auto` is unchanged for now.
