---
"@platforma-sdk/model": patch
---

Drop the "Ambiguous PObjectId" warning from the PlDataTable column resolver. Several recipes wrapping the same underlying column is expected (e.g. one column filtered by different axis values), so the message was noise. First match still wins.
