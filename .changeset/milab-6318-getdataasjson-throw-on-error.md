---
"@platforma-sdk/model": patch
---

MILAB-6318: `getDataAsJsonOrUndefined` now throws the actual resource error when the resource has reached a terminal error state, instead of conflating it with a not-ready resource or returning stale content. Not-ready still returns `undefined` (loading); ready returns the parsed value.
