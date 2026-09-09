---
"@milaboratories/pl-tree": minor
---

Add the `backend-delta` tree loading algorithm: it hands the backend the change token its
transaction was opened at and takes only the resources that changed since, resolving
references a delta pointed at but did not carry. Requires the `treeChangedSince:v1` backend
capability. `TreeLoadingRequest` gains the required members `roots` and `knownResources`, and
an optional `changedSinceToken`.
