---
"@milaboratories/pl-client": minor
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-middle-layer": patch
---

Finality predicate split into two from one table: `DefaultFinalResourceDataPredicate` stays the
tree's predicate; the transaction resource cache now uses `resourceCachePredicate(finalPredicate)`
(`PlClient.resourceCachePredicate`), which also excludes `Blob` and `StreamManager`, whose fields
change after the tree holds them final. Table changes: `BResolveSingle`, `BResolveChoice` and
`LSProvider` are never final; `Frontend/FromLocalTgz`, `json/bool`, `json/null` and
`json/errorTrace` are always final. The rule and every intended exception are documented at the
predicate. The project tree's stop rules follow the table.
