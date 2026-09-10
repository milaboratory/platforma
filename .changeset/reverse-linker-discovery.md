---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/columns-collection-driver": minor
---

Add `reverseLinkers` to column discovery, to walk linkers fine → coarse and find the roots above the anchors instead of the leaves below them

Discovery entered linkers on the many-side and exited on the one-side (e.g. `sample` → `cell`). `DiscoverColumnsOptions.reverseLinkers` flips the entry side so the traversal walks `cell` → `sample`. Only the traversal rule is reversed — linker columns are still read as-is, so results stay correct against the real linkers.

The flag is optional and omitted from the request when false, so existing discovery calls are unchanged. It is traversal scope, so — like `mode` and `maxHops` — it is not part of the `.filter()` surface. Requires the pframes-rs engine support from platforma-open/pframes-rs#295.
