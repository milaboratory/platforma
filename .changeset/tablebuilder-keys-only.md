---
"@platforma-sdk/workflow-tengo": minor
---

tableBuilder: add `keysOnly` option to `addColumn`/`addColumns`. A keys-only
column participates in the join (its key space is unioned into the output rows
and any new axes are surfaced) but its value column is not written to the
exported file. Useful for expanding the table's key space from a column whose
values are not needed in the output.
