---
"@milaboratories/pl-middle-layer": patch
---

Make template-tree cache keys linear instead of quadratic

`createTemplateV3Tree` computed a cache key for every node, and
`TemplateRenderer.updateCacheKey` built that key by recursing into the node's
entire subtree. So a node at depth *d* re-hashed everything below it, once per
ancestor — O(n²) hashing over a tree that, for the ctx-export template, has
**5,690 template nodes**.

Each node now folds in its children's own digests rather than their expanded
contents. That is still a Merkle hash, so structurally identical subtrees keep
producing identical keys and deduplication is unchanged, but each subtree is
walked once per tree instead of once per ancestor. Digests are memoised on the
node object in a `WeakMap`, which also makes a repeated render of the same
compiled template — the normal case, since `getPreparedExportTemplateEnvelope()`
memoises one spec for the process — free.

Measured on the real ctx-export template:

| | ms per render |
|---|---|
| recursive key, hashing full source (as of 1.66.9) | 493 |
| recursive key, hashing `sourceHash` (current) | 81 |
| **Merkle key + memo** | **2.2** |

The keys are internal to a single `createTemplateV3Tree` call and never
persisted, so changing how they are derived is not observable outside it.
