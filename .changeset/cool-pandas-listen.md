---
"@platforma-sdk/workflow-tengo": minor
"@milaboratories/pl-model-common": patch
---

Make `ColumnUniversalId` a first-class column reference in the workflow.

A block can now pass any id the model mints — bare leaf, `ColumnFilteredId`,
`ColumnOverriddenId`, `ColumnDiscoveredId` — straight into
`createPBundleBuilder().addSingle(...)`, `pt.frameFromColumnBundle` and
`tableBuilder`, and the workflow resolves it, reconstructs its effective spec,
and builds the linker join a discovered id describes.

New `:pframes.column-id` decodes and applies the layers (pure functions over
JSON, unit-tested offline against the TypeScript source of truth). New
`bundle.getQueryEntry(id)` compiles an id into a `SpecQueryJoinEntry` for
`pt.p._rawQueryEntry`, folding every `path` hop into a nested `linkerJoin`; new
`bundle.getAxesSpecOf(id)` reports the axes a column actually contributes,
projecting out each linker's one-side axes via the new `pSpec.linkerSides` /
`pSpec.splitAxes` / `pSpec.linkerJoinAxesSpec`.

`EnrichmentRef` becomes a derived special case: `columnId.fromEnrichmentRef`
normalizes the v1 wire form into a `ColumnDiscoveredKey`, and `tableBuilder`
resolves both spellings through one path. The type is deprecated; existing
callers keep working.

Fixes two latent defects found on the way:

- `bundle.getAxesSpec` read raw pool specs while `getSpec` applied axis filters,
  so a filtered id could contribute axes that its own spec no longer had.
  `pt.frameFromColumnBundle` calls the former before the latter, so the
  disagreement was reachable.
- `pSpec.A_IS_LINKER_COLUMN` was read by `pt.p.linkerJoin` but never exported,
  which would have panicked on the builder's first use.

No behaviour change for existing id shapes: the registration and read paths now
share one key derivation that reproduces all four previous derivations, and the
legacy `FilteredPColumnId` keeps keying on its `source`.
