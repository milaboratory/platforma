---
"@platforma-sdk/workflow-tengo": minor
---

`xsv.importFileMap`, `xsv.exportFrame`, the xsv table builder and the Xsv outputs of `pframes.processColumn` accept `memFloor`, `memSlope` and `memIntercept`, as `xsv.importFile` does. For `processColumn` the options apply per output or to every Xsv output of the call. They set the auto-sized RAM request the same way the setters of `pt.workflow()` do, and apply where the work runs through ptabler.
