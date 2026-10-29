---
"@platforma-sdk/workflow-tengo": minor
---

Add `getCanonicalId()` to smart resources. It returns the canonical ID of the resource as bytes. The value is empty until the backend sets it, and empty on old backends that do not send it.
