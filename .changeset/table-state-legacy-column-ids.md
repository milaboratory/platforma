---
"@platforma-sdk/model": patch
---

PlDataTable: carry table state saved before the column-access rework over to the current column ids.

Sorting, hidden columns, column order and filters saved before the rework kept discovered column ids without the `__isDiscovered` marker. The current id parser rejects them, so a block with such a saved sorting failed its whole table output with `extractPObjectId: unrecognized column id structure`.

- A new state version (v9) rewrites those ids to the current form, so the saved choices survive. Pre-rework anchored and filtered ids, which name a column relative to an anchor the state does not hold, are dropped; a sorting left empty this way falls back to the default.
- The table's column resolver now drops a reference whose id it cannot parse instead of throwing.
