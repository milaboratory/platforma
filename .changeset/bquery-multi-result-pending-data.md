---
"@platforma-sdk/workflow-tengo": patch
---

Fix `smart.field.getValue: field "data" is not set` when a template that awaits only the specs of a multi-result query (for example the `PColumnBundle` state over a bundle with `addMulti`) runs before the data map of the query is set. The items of such a result now carry a future of their data.
