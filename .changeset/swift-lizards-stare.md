---
'@platforma-open/milaboratories.software-ptabler': minor
---

Don't use schema_overrides anymore in reading operations, because it is unreliable in polars, in favour of post-read casting.
