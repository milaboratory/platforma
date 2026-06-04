---
"@platforma-sdk/workflow-tengo": minor
---

`pt.workflow().frame()` accepts a new `raiseIfEmpty` option. When set to `false`, a zero-byte input file is read as an empty typed table using the declared `schema` instead of raising a polars `NoDataError`. Maps directly to ptabler's new `raiseIfEmpty` field on read steps. Requires `@platforma-open/milaboratories.software-ptabler` with the matching `raiseIfEmpty` support.
