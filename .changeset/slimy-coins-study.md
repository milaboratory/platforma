---
'@platforma-sdk/workflow-tengo': minor
---

Enhanced structField expression API with native array path support and advanced options

- Replace varargs field chaining with native array-based field paths: `structField(["coordinates", "lat"])`
- Add optional `default` parameter for fallback values when fields are missing
- Add optional `dtype` parameter for automatic type casting of extracted values
- Maintain backward compatibility with single field string access
- Improve performance by using native recursive field access instead of expression chaining
