---
"@milaboratories/pl-deployments": patch
---

`processStop` returns false instead of throwing ESRCH when the process has already exited, so stopping a local backend that crashed no longer fails.
