---
"@platforma-sdk/workflow-tengo": patch
---

Fix non-deterministic resource CIDs caused by non-canonical JSON encoding in two paths:

- `createJsonResource` now encodes via `canonical.encode` (key-sorted) instead of `json.encode`, whose Go-map iteration order varied per render. This affects every `RTYPE_JSON` resource, including the SDK-internal params built inside `pframes.processColumn` and `xsv.importFile`.
- `makeTrace` (`pframes/spec.lib.tengo`) now canonical-encodes the `pl7.app/trace` annotation string. That string is embedded inside a spec resource, so its inner key order escapes the backend's outer canonicalization; a randomized order poisoned the CID of every spec consumer.

Both produced `CIDConflictError` and silent cross-project dedup misses. NOTE: this changes the CID of affected resources, so existing projects will see a one-time recompute on upgrade. See MILAB-6319.
