---
"@platforma-sdk/workflow-tengo": minor
---

`xsv.importFile` accepts `memFloor`, `memSlope` and `memIntercept`. They set the auto-sized RAM request of the import, the same way the setters of `pt.workflow()` do, and apply to "Parquet" storage. Before, a block could only replace the request with a fixed `mem`, so an import of a large table kept the default slope of 10 and asked for more memory than a node has.
