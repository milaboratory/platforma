---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/columns-collection-driver": minor
---

Column discovery can now walk linkers up the hierarchy: pass `leaves` instead of `anchors` to find what contains the given columns

Discovery only ever walked down — anchored on `sample`, it reached `cell`, but there was no way to go from `cell` to the `sample`-level columns above it. Which key you fill in says where the anchors sit, so there is no direction flag anywhere:

```ts
collection.discover({ anchors: { s: sampleRef }, maxHops: 4 }); // down to what they contain
collection.discover({ leaves: { c: cellRef }, maxHops: 4 }); // up to what contains them
```

`DiscoverColumnsOptions` is now a union of `RootAnchoredOptions | LeafAnchoredOptions`, so the two keys exclude each other at compile time; `resolveAnchorSide` resolves them at runtime and names the request arm (`axes` vs `leafAxes`) the anchors belong in. Only the traversal rule changes — linker columns are still read as-is, so results stay correct against the real linkers. `leaves` is not part of the `.filter()` surface, which pins `maxHops: 0`.

Existing `anchors` calls are unchanged, down to a byte-identical request. Requires the engine support from platforma-open/pframes-rs#295.
