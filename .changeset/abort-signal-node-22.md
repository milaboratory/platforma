---
"@milaboratories/pl-client": patch
---

`withCallAbortSignal` disposes its abort listener in `finally` and no longer uses `DisposableStack`, which Node 22 does not have.
