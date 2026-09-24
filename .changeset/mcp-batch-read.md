---
"@milaboratories/pl-mcp-server": major
---

Read several blocks in one call. `get_block_state`, `get_block_outputs` and `get_block_logs` now take `blockIds` — a list of at most ten ids, each named once — in place of `blockId`, and return one entry per requested id keyed by that id. Each entry carries either `{ ok: true, value }` or its own `{ ok: false, error, hint }`, so one unreadable block no longer fails the whole call. A list that is empty, names an id twice, or exceeds the maximum is refused before any read runs. Writes are unchanged: `set_block_data` still takes a single `blockId`.

This is a breaking change to those three tools' parameters and return shape.
