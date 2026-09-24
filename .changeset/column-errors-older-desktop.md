---
"@milaboratories/pl-model-common": patch
"@platforma-sdk/model": patch
---

Column errors on an older desktop, and on an output resource itself.

- `GlobalCfgRenderCtxFeatureFlags.columnErrorsSupport` tells the sandbox the host reads column errors. Without it the sandbox sends no `errors` columns source, which an older desktop's driver cannot read; an errored block output then just adds no columns, and `ColumnsCollection.getErrors()` is empty.
- On any host, a block output lookup that throws is reported as that output's error instead of failing the caller.
- An error on the output resource itself is reported at the output's path; the columns under it are still listed. `AccessorLike` gets `getError()` and `getDataAsString()`, and `decodeErrorMessage` moves to `pl-model-common`.
- `CommonFieldTraverseOps` gets `pureFieldErrorToUndefined`, which the host has long supported.
