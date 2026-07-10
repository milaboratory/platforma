---
"@platforma-sdk/ui-vue": patch
"@milaboratories/uikit": patch
---

Fix an infinite grid-remount loop in `PlAgDataTableV2` that made the column
headers strobe (rapid flickering of the column type icons) and flooded the
console with AG Grid "grid has been destroyed" (#26) errors.

The reload watch destroys and recreates the whole grid via `:key="reloadKey"`.
The stored grid state was read through a debounced cache, so right after a
reload the cache kept reporting the pre-reload value while the fresh grid
already reported the state AG Grid normalized it to; the two never converged and
the grid remounted on every frame. `computedCached` gains a `writeThrough`
option that adopts a set value into the cache synchronously (the debounce then
only defers the downstream write), so the reload comparison converges after the
single remount that applies the state.

Also guards the row-number column auto-size so it no longer calls
`applyColumnState` on an already-destroyed grid.
