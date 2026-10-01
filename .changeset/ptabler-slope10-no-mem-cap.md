---
"@platforma-sdk/workflow-tengo": patch
---

ptabler default RAM request: slope raised from 6 to 10 GiB per input GiB, and the 256 GiB ceiling removed. `memFloor()` no longer rejects floors above 256 GiB.
