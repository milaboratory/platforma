---
'@platforma-sdk/workflow-tengo': patch
---

Ensure pip installs Python dependencies from local sources only by adding the `--no-index` flag. This prevents any attempts to connect to the public PyPI repository, making dependency installation more secure and reliable in isolated environments.
