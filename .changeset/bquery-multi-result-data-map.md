---
"@platforma-sdk/workflow-tengo": patch
---

A multi-result query result also links its data map as `dataMap`, and the `PColumnBundle` await state waits for it. A template that reads a bundle with `addMulti` no longer runs before the data map of the query reaches the result, for family-2 queries too. `data` is kept for templates that await it; the unmarshaller reads the map from whichever of the two is set.
