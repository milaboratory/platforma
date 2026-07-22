---
"@milaboratories/pl-middle-layer": patch
---

Template cache-key: hash each artifact's existing `sourceHash` instead of re-hashing its full source in `updateCacheKey`. `sourceHash` is already the sha256 of that source (the `hashToSource` key), so cache keys are unchanged, but the biggest measured desktop-worker CPU cost (streaming large template/WASM sources through sha256, once per ancestor) is eliminated.
