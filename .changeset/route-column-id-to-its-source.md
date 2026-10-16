---
"@platforma-sdk/model": patch
---

Resolving a column by id looks only at the source the id belongs to: a result-pool id reads the result pool, a local id reads the accessor its path starts with. A broken staging output no longer fails `DataColumn.fromId` or `getStatusById` for a result-pool or main-output id.
