---
"@platforma-sdk/workflow-tengo": patch
---

v2 workflow: the `effect` output omits its `imports` section when the body imports nothing, leaving an empty map; an effect that lists imports is unchanged.
