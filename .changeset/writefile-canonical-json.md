---
"@platforma-sdk/workflow-tengo": minor
---

`exec.builder().writeFile(name, data)` now accepts maps and arrays directly and serializes them via `canonical.encode` (sorted keys at every level). Previously, callers wrote `writeFile(name, json.encode(value))` and relied on Tengo stdlib `json.encode`, which preserves Go's randomized map iteration order — so the file bytes (and the exec step's dedup CID) varied across runs of identical input.

Strings, bytes, and resource references pass through unchanged.

Migrated all internal call sites in the SDK (`pframes/util.lib.tengo`, `pframes/xsv-import-file.lib.tengo`, `pt/workflow-run.tpl.tengo`) to pass the map/array directly. External callers that already use `writeFile(name, json.encode(value))` are not broken — but should migrate to `writeFile(name, value)` to get CID stability.
