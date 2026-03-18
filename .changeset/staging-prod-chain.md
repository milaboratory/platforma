---
"@milaboratories/pl-middle-layer": minor
---

Replace staging cascade with production context chain.

Arg changes now render staging inline for the changed block only (O(1) instead of O(N) cascade).
A pre-built chain of BContext resources accumulates production contexts from all blocks above each position.
Background refresh simplified from 700ms lag-based rendering to 2s simple iteration.
Schema bumped to v4 to prevent older clients from operating on migrated projects.
