---
"@platforma-sdk/workflow-tengo": patch
---

Fix `field "data" is not set` when a template that awaits `PColumnBundle` started before the data map of a multi-hit query (`addMulti`) was linked. A multi-hit query result that fetches data now has a `multiData` field; `PColumnBundle` awaits it, and the result's data map is read from it.
