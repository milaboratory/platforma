---
"@platforma-sdk/workflow-tengo": patch
---

Fix `field "data" is not set` when a template that awaits `PColumnBundle` starts before the data of a multi-hit query (`addMulti`) is set. Each column of the query now gets a future data field. For a `:v2` query, the future of a column without data resolves to the no-result marker.
