---
"@platforma-sdk/workflow-tengo": minor
---

Report block action context from templates. `self.actionContext()` and `smart.resource.status()` return a handle with `record(namespace, state, ...detail)`, `setReading(namespace, key, value)`, `setBaggage(key, value)` and `create()`. `render()` names the action context of a rendered template after the imported template, or the new `name` option. Resources created through the smart builders get the current renderer as parent, so they report into its action context. Everything is a no-op unless the backend supports block action context (`feats.actionContextApi`).
