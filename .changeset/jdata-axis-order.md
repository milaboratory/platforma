---
"@platforma-sdk/workflow-tengo": patch
---

Write the keys of a Json column's `.jdata` file in axis value order: numbers as numbers (so `[9]` comes before `[10]`, and `[-10]` before `[-1]`) and strings in byte order. The new encoder is also much faster on large columns (about 25x at 70,000 rows). The file bytes change, so ptabler steps that read such a column run again once after the update.
