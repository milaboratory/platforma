---
"@milaboratories/pl-client": patch
---

PlClient built with a logger now warns about retried transaction commit conflicts with the transaction name, lock id, attempt, next delay and work done, at most once per transaction name every 10 seconds.
