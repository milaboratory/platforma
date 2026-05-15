---
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

PlAgDataTableV2: shrink persisted grid colIds by ~16×

The AG Grid `colId` produced by `PlAgDataTableV2` is now `canonicalizeJson<PTableColumnId>(getPTableColumnId(spec))` instead of `canonicalizeJson<PTableColumnSpec>(spec)`. The full column spec (including all annotations and the `pl7.app/trace` chain) used to be embedded in every entry of `orderedColIds` and `hiddenColIds`; for tables with ~1,500+ columns this could push persisted block storage past 10 MB and trip the QuickJS heap cap during `mutate-block-storage`.

Measured on a real ~1,600-column overlap table: persisted block-storage payload drops from 11.5 MB to 0.7 MB.

The full `PTableColumnSpec` remains available on each `ColDef.context` for callsites that have a live ColDef (`useFilterableColumns`, CSV export). State-only callsites (sort model, hidden column ids) now parse the colId directly as a `PTableColumnId` instead of a full spec.

State version bumped to 7; a v6→v7 migration rewrites every persisted colId in place. v4 and v5 chains pass through v6 first.
