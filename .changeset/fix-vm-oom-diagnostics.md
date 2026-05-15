---
"@milaboratories/pl-middle-layer": patch
---

Fix block VM OOM diagnostics

- Fix off-by-one bug in `ErrorRepository.getOriginal` that mangled native QuickJS error names into nonsense like `nalError` when `cause.name` did not contain a `/uuid:` suffix; native errors (`InternalError: out of memory`, stack overflow) now surface verbatim.
- Log `currentStorageJson` and payload (full JSON content + sizes) on storage-update failure, and log sizes on entry when `MI_LOG_JS_EXEC_STAT` is set, so VM OOMs are diagnosable from logs.
