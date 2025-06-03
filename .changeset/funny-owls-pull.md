---
'@platforma-sdk/workflow-tengo': patch
---

- significant review of await logic
- fix via hacky workaround for "Final" resource state await
- significant optimization of await logic, so it uses less subscriptions
- resourceDuplicateEvent feat for future backend upgrade
- createDynamicField method for smart resource
