---
'@platforma-sdk/workflow-tengo': patch
---

The software execution plan logic now considers Docker availability. If Docker is available and a software descriptor includes a 'docker' configuration, the Docker execution path is prioritized. Otherwise, it falls back to binary or local execution.
