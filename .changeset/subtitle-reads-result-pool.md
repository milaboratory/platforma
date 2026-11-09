---
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/model": patch
---

The block subtitle now renders with the result pool, so `.subtitle()` can name the inputs a block reads (for example `ctx.resultPool.getPColumnSpecByRef(ref)`) without the UI caching that text in block data. The title stays args-only.
