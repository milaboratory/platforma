---
"@platforma-sdk/workflow-tengo": minor
---

Add label derivation, linker column, and spec utilities to Tengo workflow SDK.

New modules:
- `pframes.labels`: `deriveDistinctLabels` — trace-based label disambiguation (port of TypeScript `deriveDistinctLabels`)
- `pframes.linkers`: `linkerSingleMatchQuery`, `buildLinkedSelector` — linker column discovery helpers
- `pframes.spec`: `pickStringDomain`, `makeColumnKey` — spec utility functions
