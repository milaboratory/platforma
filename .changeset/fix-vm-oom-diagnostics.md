---
"@milaboratories/pl-middle-layer": patch
---

Fix block VM OOM diagnostics and bump QuickJS memory cap

- Bump per-VM `setMemoryLimit` from 8MB to 16MB in `executeLambdas` and `executeSingleLambda` to accommodate blocks with larger storage state (e.g. ~1500-field datasets).
- Fix off-by-one bug in `ErrorRepository.getOriginal` that mangled native QuickJS error names into nonsense like `nalError` when `cause.name` did not contain a `/uuid:` suffix; native errors (`InternalError: out of memory`, stack overflow) now surface verbatim.
- Log `currentStorageJson` / payload sizes on storage-update failure (always) and on entry (gated by `MI_LOG_JS_EXEC_STAT`) so future VM OOMs are diagnosable from logs.
