---
"@platforma-sdk/workflow-tengo": minor
---

tableBuilder: setColumnJoin("left" | "full" | "inner") and a per-column join option control how columns added with addColumn / addColumns are joined onto the primaries. The default stays "full". Use "left" with a filtered primary so added columns don't bring back keys the filter removed.
