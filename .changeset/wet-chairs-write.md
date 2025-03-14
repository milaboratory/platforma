---
'@platforma-sdk/workflow-tengo': patch
---

Minor fixes for trace propagation logic:
- fixes makeTrace with empty array as input for steps
- enables trace propagation in processColumn even if trace steps are not specified, but input has tracing information
