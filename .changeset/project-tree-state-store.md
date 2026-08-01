---
"@milaboratories/pl-tree": minor
"@milaboratories/pl-middle-layer": patch
---

Add an opt-in persistent store for project tree state (off by default)

A cold `SynchronizedTreeState.init` starts from an empty heap, so
`constructTreeLoadingRequest` has nothing to report as `finalResources` and the
backend re-sends the whole tree. For a project this is pure repetition: opening
the same project twice transfers byte-identical payload both times (measured:
5,720 resources / 4,818,664 B on each of two opens).

`SynchronizedTreeOps.stateStore` lets a tree's owner supply a `TreeStateStore`
that is consulted before the first refresh and written on `terminate()`. When
present, the first refresh behaves like every subsequent one — resources the
store holds are reported as already-known and skipped.
`pl-middle-layer` supplies a file-backed store per project, next to the existing
block-frontend cache, enabled only when `MI_PROJECT_TREE_CACHE` is set.

**It is off by default because one correctness question is still open, and the
answer is not mine to give.** Two things were established while building it:

- **A partial replay is not possible.** The plan was to persist only types that
  are immutable by construction — `BlockPackCustom` above all, which is 63–90 %
  of a project's bytes. But `PlTreeState` requires every resource to be reachable
  from a root, so replaying block packs alone throws `orphan resource`, and that
  throw calls `invalidateTree()` — a rejected hydration leaves the tree unusable
  rather than merely un-warmed. A store must supply a connected subgraph, which
  in practice means the whole tree.
- **Which forces reliance on `ExtendedResourceData.final`,** and that flag is
  `frame.final || frame.traverseWasStopped`: it covers both genuinely immutable
  resources and ones where our own stop rules ended traversal. Those stop rules
  are gated on `readyOrDuplicateOrError()`, so such resources are at least
  settled — but settled is not immutable, and the store cannot tell them apart.

Enabling this needs a `pl-tree` owner to either confirm that
`traverseWasStopped` resources are safe to persist, or split the flag.

Related, and contrary to what `pl-client`'s lint rule warns: resource signatures
were byte-identical across two client sessions 12 h apart for all seven block
packs of a real project. The store still records **signed** root ids and rejects
a file whose roots differ, so a backend that does re-mint signatures produces a
clean cache miss and a full load rather than a heap full of ids the backend will
not accept.

Measured on a 7-block project against a remote backend, both arms in one build:

| | flag off | warm store |
|---|---|---|
| `openProject` wall | 5,335 ms | **2,968 / 3,065 ms** (−43 %) |
| resources retrieved | 5,720 | **49** |
| bytes retrieved | 4,818,664 | **9,790** (−99.8 %) |
| backend time for the load | 3,379 ms | **90 / 91 ms** (−97 %) |

The re-opened project reports all 7 blocks with unchanged statuses. The residual
~3 s is the rest of `Project.init` plus parsing the store file, which is 23.5 MB
of JSON for 4.8 MB of payload — the naive format is the next thing to fix.

Tests: 6 unit tests over the store's format and rejection rules, plus an
integration test that a project survives close → re-open on replayed state, and
that deleting the store falls back to a cold load.
