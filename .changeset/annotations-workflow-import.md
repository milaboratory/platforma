---
"@platforma-sdk/workflow-tengo": patch
---

Fix annotations failing with "tpl.body() callback must return the same list of outputs". The annotations template no longer imports :workflow, whose outputs were added to it now that the backend evaluates each module once per run.
