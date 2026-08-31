---
"@milaboratories/pl-mcp-server": patch
---

Explain the four unreadable-data cases instead of failing opaquely. A block state that is not ready yet, an empty column list, a column whose value type cannot be returned, and a handle that resolves as neither table nor frame each now answer with a named error and a next step. A refused table read is an error envelope rather than a success payload holding an `error` key, and an unresolvable handle becomes an entry carrying both read failures rather than the bare string.
