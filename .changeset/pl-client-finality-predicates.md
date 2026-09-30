---
"@milaboratories/pl-client": minor
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-middle-layer": patch
---

Finality is one table built in layers (`FinalityTable`): `StrictFinality` (nothing observable
changes after final), `CacheFinality` (adds the types whose only later writes are KV; used by
the transaction resource cache) and `TreeFinality` (adds `Blob` and `StreamManager`, whose later
writes tree readers never observe; the default `PlClient.finalPredicate`). A layer only adds to
its parent. `DefaultFinalResourceDataPredicate` is a deprecated alias of `TreeFinality`.
Table changes: `BResolveSingle`, `BResolveChoice` and `BlobCopy/*` are final once ready with
every output filled; `LSProvider` is never final; `Frontend/FromLocalTgz`, `json/bool`,
`json/null` and `json/errorTrace` are always final. The project tree's stop rules are generated
from `TreeFinality`, each entry declaring how it translates. New `ResourceTypePrefix.BlobCopy`.
