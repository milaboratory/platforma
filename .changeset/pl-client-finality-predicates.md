---
"@milaboratories/pl-client": minor
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-middle-layer": patch
---

Finality is one table built in layers (`FinalityTable`): `StrictFinality` (the base: nothing
observable changes after final, except the writes its entries name), `CacheFinality` (adds the
types whose only later writes are KV; used by the transaction resource cache) and `TreeFinality`
(adds `Blob` and `StreamManager` under the reader assumptions stated at their entries; the
default `PlClient.finalPredicate`). A layer only adds to its parent.
`DefaultFinalResourceDataPredicate` is deprecated and delegates to `TreeFinality`.
Table changes: `BResolveSingle`, `BResolveChoice` and `BlobCopy/*` are final once ready (or a
duplicate, or errored) with outputs locked and every supplied field settled; `LSProvider` is never final; `Frontend/FromLocalTgz`, `json/bool`,
`json/null` and `json/errorTrace` are always final. The project tree's stop rules are generated
from `TreeFinality`, each entry declaring how it translates. New `ResourceTypePrefix.BlobCopy`.
