---
"@platforma-sdk/workflow-tengo": minor
---

The v2 layer (`:v2.*`) for platforma2 workflows, unstable: the `v2.workflow` entry (outputs `result` and `exports`), typed export constructors in `v2.exports`, the BContext/2 query API in `v2.bquery`, and the `v2.export-for-ui` template. `workflow.bquery` gains `forFamily(n)`; `pframes.bundle` gains `createBuilderWith` and `pframes.table-builder` gains `tableBuilderWith`, which take the query API to resolve with; the `:tpl` API gains `definedOutputs()`. Existing functions are unchanged.
