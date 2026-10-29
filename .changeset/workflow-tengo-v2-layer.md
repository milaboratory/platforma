---
"@platforma-sdk/workflow-tengo": minor
---

The v2 layer (`:v2.*`) for platforma2 workflows, unstable. platforma2 is the next block runtime: a block exports a typed values tree and downstream blocks read it through BContext/2 contexts. The layer has the `v2.workflow` entry (outputs `result` and `exports`), typed export constructors in `v2.exports`, the BContext/2 query API in `v2.bquery`, and the `v2.export-for-ui` template. In it a ref is `{block, workflow, name}`; a single lookup finds exactly one value or fails; query options are checked.

`workflow.bquery` gains `forFamily(n)`, the query API of resolver family `n`: 1 is the existing functions (BResolveSingle/1, BResolveChoice/1 over BContext/1), 2 resolves over BContext/2; the shared result decoder decodes family-2 results. `pframes.bundle` gains `createBuilderWith` and `pframes.table-builder` gains `tableBuilderWith`, which take the query API to resolve with. The `:tpl` API gains `definedOutputs()`. Existing public signatures and the family-1 path are preserved, except that `resolve` no longer writes into the caller's options map.
