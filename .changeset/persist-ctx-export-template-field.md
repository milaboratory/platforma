---
"@milaboratories/pl-middle-layer": patch
---

Stop rebuilding the ctx-export template on every project refresh

`ProjectMutator.load` materializes the ctx-export template when the project has
no cached `__serviceTemplate<hash>` field for the current template hash, and
creates that field so later loads can reuse it. But `withProjectAuthored`
discards the whole transaction when the caller changed nothing
(`if (!mut.wasModified) return result`), so for a project that only ever
receives no-op refreshes the field was never committed — and the refresh loop
runs `load()` every couple of seconds.

The result was a project that permanently re-materialized and re-hashed the
entire ctx-export template on a two-second cycle. Measured on a desktop client
against a remote backend: opening one such project put the worker thread at
**25 % busy in 845 ms contiguous synchronous chunks, indefinitely**, and closing
it took that straight back to zero. Two of six real projects reproduced it — the
two whose last commit predated the current `pframes.export-pframe-for-ui`
template, which is the normal state of any project not edited since the last SDK
bump.

A mutator now reports `hasUnsavedServiceState` when `load()` had to create that
field, and `withProjectAuthored` commits for it. `save()` is untouched and stays
a no-op, so nothing the caller did not ask for is written; the commit persists
only the service field. It happens once per project per template hash.

Measured after the change, same projects and backend:

| | before | after |
|---|---|---|
| idle worker blocked, one affected project open | 25.6 % | **0 %** |
| cold open, project A | 4,890 ms | **3,213 ms** |
| cold open, project B | 5,262 ms | **3,539 ms** |

The field is pruned from the project tree (`projectTreePruning` drops
`__serviceTemplate*`), so tree payloads are byte-identical before and after.
Projects that already carried the field are unaffected.

Scope worth noting: any transaction that *did* modify something already committed this
field as a side effect, so the burn only ever affected a project opened and left
unedited — which is exactly the browsing/reading case where sluggishness is most
visible. That also means this change does not introduce a new class of write: the same
`createField` was already reaching the server from every committing transaction. Two
clients opening the same stale project can now both attempt it; the loser's transaction
fails and the refresh loop's existing retry picks up the committed field.
