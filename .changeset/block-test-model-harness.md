---
"@platforma-sdk/test": minor
---

`BlockModelHarness`: backend-free model tests. Loads a block's model under a fake render context and calls its facade callbacks (`args`, `prerunArgs`, `templateParams`, `initialStorage`/`initialData`, `dataFromParams`, `validateParams`) and data-only render lambdas (`render`) as the middle layer does: found through the block config, with results read back through JSON.
