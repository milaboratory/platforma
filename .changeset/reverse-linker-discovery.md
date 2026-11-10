---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pf-spec": minor
"@milaboratories/pf-spec-driver": minor
"@milaboratories/columns-collection-driver": minor
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/model": minor
---

New `ColumnsCollection.discoverRoots`: find the columns the given ones hang off

`discover` starts from anchors and walks linkers down to what they contain (anchored on `sample`, it reaches `cell`). There was no way to go the other way, from `cell` to the `sample`-level columns above it. `discoverRoots` takes the columns you have and returns the roots they hang off:

```ts
const found = collection.discoverRoots({ leaves: { c: cellRef }, mode: "enrichment", maxHops: 4 });
// found: Array<{ root: ColumnRecipe; leaf: ColumnRecipe; path: ColumnRecipe[] }>
```

Each entry is exactly what `discover({ anchors: { r: root } })` would return for the leaf: `leaf` is the requested column as a discovered column carrying the linker path and qualifications, so the table is built from `root` as the anchor plus `leaf`, the same way as for any discovered column. `discover` is unchanged.

The engine side is the new `discoverRoots` request of the spec frame (`PFrameSpecDriver.discoverRoots`), from platforma-open/pframes-rs#295.
