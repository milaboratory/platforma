---
"@platforma-sdk/workflow-tengo": minor
---

`v2.workflow` renders a third output, `effect`, and calls the body as `fn(args, effect)`. `effect.importFile(source)` imports an upload grant (`upload://upload/…`) or a library file (`index://index/…`) and returns the imported file; the render lists each import under `effect.imports.<source>` as an `ImportEntry/1` with the fields `upload` (uploads only), `progress` and `file`, so the engine runs and reports the import. `effect` is always set, with an empty `imports` map when nothing is imported, and `importFile` refuses calls made after the body has returned.

Breaking for v2 workflows: a body declared as `func(args)` must become `func(args, effect)`, and the output guard now requires exactly `result`, `exports` and `effect`.
