---
"@platforma-sdk/workflow-tengo": minor
---

Add `canonicalId()` to the template object (`tpl`): a pure template reads the canonical ID of its own renderer from the template body. The function fails in ephemeral templates (an ephemeral renderer has no canonical ID), during initialization (the backend did not set the ID yet), and on backends that do not give final canonical IDs. Add `canonicalIdExposure` to `feats`: true when the backend reports `canonicalIDExposure`, `supportsScratchSpaceRequests` or `scratchSpace`.
