---
"@platforma-sdk/workflow-tengo": minor
---

Report block status from templates. `self.status()` and `smart.resource.status()` return a handle with `record(topic, state, ...detail)`, `setAttr(topic, key, value)`, `setData(key, value)` and `create()`. `render()` names the status context of a rendered template after the imported template, or the new `name` option. Resources created through the smart builders get the current renderer as parent, so they report into its status context. Everything is a no-op unless the backend supports block status (`feats.statusApi`).
