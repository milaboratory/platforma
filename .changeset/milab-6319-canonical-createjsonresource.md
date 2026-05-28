---
"@platforma-sdk/workflow-tengo": patch
---

Fix non-deterministic `RTYPE_JSON` resource CIDs: `createJsonResource` now encodes via `canonical.encode` (key-sorted) instead of `json.encode`, whose Go-map iteration order varied per render. The non-determinism propagated to structural consumers (`json/getField` inside `pframes.processColumn` and `xsv.importFile`), causing `CIDConflictError`. NOTE: this changes the CID of every `RTYPE_JSON` resource, so existing projects will see a one-time recompute on upgrade. See MILAB-6319.
