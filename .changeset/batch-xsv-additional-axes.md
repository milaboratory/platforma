---
"@platforma-sdk/workflow-tengo": minor
---

pframes.processColumn: batch-mode Xsv outputs can now declare additional body-produced axes via `settings.axes`, alongside `settings.batchKeyColumns`. Previously the two were mutually exclusive, so a body that emitted new axes beyond the batch keys had no way to declare them (only ResourceMap outputs supported this). The combined output key is `[isolation…, batchKey…, additional…]`.
