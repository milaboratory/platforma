---
"@platforma-sdk/model": patch
---

MILAB-6318: on error, `getDataAsJsonOrUndefined` now throws the resource's decoded error message instead of `getDataAsJson`'s generic "Resource has no content." Not-ready returns `undefined` (loading); ready returns the parsed value.
