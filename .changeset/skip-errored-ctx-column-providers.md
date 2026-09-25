---
"@platforma-sdk/model": patch
---

Skip an errored `outputs` or `prerun` accessor in `getCtxProviders` and in the `"current_block"` source of `ColumnsCollection`. A block whose own staging output carries a field or resource error no longer fails `ColumnsCollection(["result_pool"]).getColumns()` or `ColumnsCollection()`. `ctx.prerun` and `ctx.outputs` keep their behavior and still surface the error.
