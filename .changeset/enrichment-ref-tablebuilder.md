---
"@milaboratories/pl-model-common": minor
"@platforma-sdk/model": minor
"@platforma-sdk/workflow-tengo": minor
"@milaboratories/pf-driver": patch
"@milaboratories/pf-spec-driver": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-open/milaboratories.software-ptabler": patch
---

Add `EnrichmentRef` — a versioned envelope around a terminal column hit
and an ordered linker path, mirroring `PrimaryRef`'s pattern so the
dependency scanner deep-walks `PlRef`s inside it without changes. Adds
`EnrichmentStep`, `isEnrichmentRef`, `createEnrichmentRef` exports.
Today only `linker` steps are supported; the `type` discriminant leaves
room for future step kinds.

`tableBuilder.addColumn` / `addColumns` accept `EnrichmentRef` and
`ResolvedEnrichmentRef`. The `:pframes.build-table` ephemeral registers
the hit + every hop column in the PFrame, calls
`pframes.build-query.buildQuery` to assemble the query, and hands the
resulting `SpecQueryJoinEntry` straight to `pt.p._rawQueryEntry` — ptabler
resolves the linker join natively, no node-by-node translation.

Adds `pt.p._rawQueryEntry(columnsByName, joinEntry)` (internal — `_`
prefixed) for wrapping a pre-built `SpecQueryJoinEntry` (e.g. from
`bquery.buildQuery`) into a PEntry. Application code should compose
with the public builders (`p.column / p.inner / p.linkerJoin / …`).

The spec distiller now preserves the `pl7.app/isLinkerColumn`
annotation on column specs (all other annotations are still stripped).
ptabler reads this annotation at execution time to populate the spec
frame's linker index — without it, `linkerJoin` queries silently
degrade to inner joins.

Drops the `qualifications` field from the typed shapes of
`DiscoverColumnsLinkerStep`, `MatchVariant.path[]` items, and
`DiscoveredPColumn`'s linker path items. Per-step linker qualifications
were always empty (qualifications attach to query/hit ends, not to
intermediate steps) — `BuildQuery` already discarded them, and the
tooltip / `createPlDataTableV3` consumers were forwarding empty arrays.

`DiscoveredPColumnId` no longer carries per-step `qualifications` in
its canonicalized JSON form. The Rust side still emits the field on
the wire; the TS deserializer ignores it.
