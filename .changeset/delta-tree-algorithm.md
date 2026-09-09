---
"@milaboratories/pl-tree": minor
---

Add the `backend-delta` tree loading algorithm: it hands the backend the change token its
transaction was opened at and takes only the resources that changed since, resolving
references a delta pointed at but did not carry. `TreeLoadingRequest` gains `roots`,
`knownResources` and `changedSinceToken`.
