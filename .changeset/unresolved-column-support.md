---
"@platforma-sdk/model": minor
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pf-driver": patch
---

Support working with unresolved (not-yet-ready) columns in `createPFrame` / `createPTable`.

Blocks can now build a PFrame or PTable while some referenced columns are still computing or absent — partial-data rendering is supported end-to-end. Previously a not-ready column threw `"Data not ready."` from the driver and blew up the whole render.

What changed:

- `parseDataInfoResource` returns `undefined` instead of throwing when the underlying resource is not ready.
- The middle-layer `DataInfoResolver` signature is now `(spec, data) => DataInfo<TreeEntry> | undefined`. Columns whose data resolves to `undefined` are filtered out before `pFrames.acquire`.
- `transformPColumnData` (render API) emits an empty `PColumnValues` (`[]`) for accessors / `DataInfo` trees that are not ready, so the column carries an empty body rather than failing.
- `ResultPool.getColumnStatusByRef` now consistently returns `"absent"` (debug variants `"absent1"`/`"absent2"`/`"absent3"` are gone), and `formatSpecialValues` in `PlAgDataTable` matches on the canonical value.

Combined with the existing `PColumn.dataStatus` field, blocks now have enough information to render tables with "computing" / "absent" / "error" placeholders per column instead of waiting for every column to resolve.
