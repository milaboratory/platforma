---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/columns-collection-driver": minor
---

Column discovery can now walk linkers up the hierarchy: pass `leaves` instead of `anchors` to find what contains the given columns

Discovery only ever walked down — anchored on `sample`, it reached `cell`, but there was no way to go from `cell` to the `sample`-level columns above it. The direction is now expressed by which key you fill in, so there is no new flag:

```ts
collection.discover({ anchors: { s: sampleRef }, maxHops: 4 }); // down to what they contain
collection.discover({ leaves: { c: cellRef }, maxHops: 4 }); // up to what contains them
```

The two keys are mutually exclusive; `resolveAnchorSide` resolves them into the request's `anchorsAre` discriminator. Only the traversal rule changes — linker columns are still read as-is, so results stay correct against the real linkers. `leaves` is not part of the `.filter()` surface, which pins `maxHops: 0`.

Existing `anchors` calls are unchanged, down to a byte-identical request. Requires the engine support from platforma-open/pframes-rs#295.
