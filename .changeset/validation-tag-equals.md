---
"@platforma-sdk/workflow-tengo": patch
---

`validation`: a tag value may contain `=`, so a schema such as `string,regex=^x=y$` checks the whole regex instead of the part before its first `=`.
