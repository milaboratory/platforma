---
"@platforma-sdk/workflow-tengo": minor
---

Add `canonicalId()` to the template object (`tpl`): a pure template reads the canonical ID of its own renderer from the template body. The function fails in ephemeral templates, which have no canonical ID. Add `canonicalIdExposure` to `feats`: true when the backend reports `canonicalIDExposure`, `supportsScratchSpaceRequests` or `scratchSpace`.

On backends that do not give final canonical IDs, the new internal `canonical-id` library calculates a missing canonical ID on the template level with the backend formula. `anonymize` uses it, so it gives correct field names also on backends v4.2.0 to v4.3.0, which did not give the canonical ID of value resources. On those backends, anonymized names change one time. On backends before v1.34.0, which cannot calculate SHA-256, a missing canonical ID causes an error that tells to update the backend.
