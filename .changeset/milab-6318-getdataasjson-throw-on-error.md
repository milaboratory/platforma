---
"@platforma-sdk/model": patch
---

MILAB-6318: on error, `getDataAsJsonOrUndefined` now throws the resource's error message (unwrapped from the backend's `{"message": ...}` envelope, tagged with the resolve path) instead of `getDataAsJson`'s generic "Resource has no content." Not-ready returns `undefined` (loading); ready returns the parsed value.
