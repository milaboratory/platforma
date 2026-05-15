---
"@platforma-sdk/model": patch
---

Fix O(anchors × columns) anchor resolution in `AnchoredColumnCollectionImpl`

`resolveAnchorMap` previously called `deriveNativeId(col.spec)` once per column per spec-based anchor, doing a full JSON serialize each time. For tables with many anchors (e.g. `createPlDataTableV3` → `discoverLabelColumnVariants`, where every primary column becomes an anchor), this could exceed the 10 s QuickJS deadline and surface as `InternalError: interrupted` from block models.

Anchor lookups now use lazily-built `Map<PObjectId, …>` and `Map<NativePObjectId, …>` instead of linear `.find(...)` scans, dropping the work to `O(columns + anchors)` total serializations.
