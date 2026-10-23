---
"@platforma-sdk/workflow-tengo": patch
---

Write the keys of a Json column's `.jdata` file in axis value order: numbers as numbers (so `[9]` comes before `[10]`, and `[-10]` before `[-1]`) and strings in byte order. pframes-rs before 1.2.0 reads the file in this order, so a join on such a column could give wrong rows.
