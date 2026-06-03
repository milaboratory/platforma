---
"@platforma-sdk/workflow-tengo": patch
---

Resource formulas: reject non-positive/non-integer mem/cpu formula results with a clear error (instead of an opaque backend failure), and match `f.lineCount()` file extensions and compression suffixes (`.gz`/`.bz2`/`.zst`) case-insensitively.
