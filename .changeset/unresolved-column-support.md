---
"@platforma-sdk/model": minor
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pf-driver": patch
---

Support working with unresolved (not-yet-ready) columns end-to-end. PFrames and PTables can now be built while some referenced columns are still computing or absent — the visible part of the table renders per-column placeholders for `computing` / `absent` / `error` instead of waiting for every column to resolve.

**Driver-level partial-data plumbing:**

- `parseDataInfoResource` returns `undefined` instead of throwing when the underlying resource is not ready.
- The middle-layer `DataInfoResolver` signature is now `(spec, data) => DataInfo<TreeEntry> | undefined`. Columns whose data resolves to `undefined` are filtered out before `pFrames.acquire`.
- `transformPColumnData` (render API) emits an empty `PColumnValues` (`[]`) for accessors / `DataInfo` trees that are not ready, so the column carries an empty body rather than failing.

**Cheap resolution status, separate from terminal status (BREAKING):**

- New type `PColumnStatus = "absent" | "resolving" | "resolved"` describes only the resolution phase of the data slot in the tree — cheap, no subscription on the data resource.
- Existing `PColumnDataStatus = "absent" | "computing" | "error" | "ready"` is now strictly a UI-layer terminal status, surfaced via the `pl7.app/dataStatus` annotation.
- `PColumn.dataStatus` is renamed to `PColumn.status` and re-typed as `PColumnStatus`. Migration: `"ready" → "resolved"`, `"computing" → "resolving"`, `"absent"` unchanged. The terminal `"error"` is no longer a column-level state — it is only knowable when the data is read.
- `ResultPool.getColumnStatusByRef` / `RenderCtx.getStatusByRef` / `JsRenderInternal.getPObjectStatusByRef` now return `PColumnStatus` and no longer call into `result.data?.()`. Asking for the status no longer subscribes the consumer to the data resource.
- `ResultPool.getColumnStatusByRef` debug variants `"absent1"`/`"absent2"`/`"absent3"` are gone; it consistently returns `"absent"` (matched in `formatSpecialValues`).

**Visible-only terminal status in `createPlDataTableV3`:**

- New helper `resolveDataStatus({ status, data })` derives the terminal `PColumnDataStatus` from a column's resolution status plus a (potentially deferred) data read: `resolved + data → "ready"`, `resolved + !data → "error"`, otherwise `"absent" / "computing"`.
- `withDataStatusAnnotations` now reads each column's `data` to compute the terminal — applying it subscribes that column's resource. It is therefore applied **only** to the visible part of the table (primary + visible direct + visible linked). The full-table and PFrame paths skip it, so hidden columns no longer drive recomputation.

This separates "is the slot filled?" (cheap, broadcast everywhere) from "what is in the slot?" (paid only where the UI actually renders the cell), and lets the UI distinguish "empty data slot" from "legitimately empty data" via the annotation rather than guessing from the value.
