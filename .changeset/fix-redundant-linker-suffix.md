---
"@platforma-sdk/model": patch
---

Fix `deriveDistinctLabels` adding redundant "via …" linker suffix to records whose native label is already unique when other records collide on a shared linker.
