---
"@platforma-sdk/block-tools": patch
---

structurer: `managed(path, initial, body)` bodies now receive the active
`RunContext` as an argument (`(ctx) => …`), matching `generate`/`tpl`/`when`.
Rule code no longer reaches for the module-global `getActiveRunContext()` —
every execution-level lambda gets `ctx` by argument. Internal refactor; no
change to generated block output.
