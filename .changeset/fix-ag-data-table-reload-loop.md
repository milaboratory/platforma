---
"@platforma-sdk/ui-vue": patch
---

Fix an infinite grid-remount loop in `PlAgDataTableV2` that made the column
headers strobe (rapid flickering of the column type icons) and flooded the
console with AG Grid "grid has been destroyed" (#26) errors.

The reload watch destroys and recreates the whole grid via `:key="reloadKey"`.
Because the stored grid state is read through a debounced cache, right after a
reload it could still report the pre-reload value while the fresh grid already
reports the state AG Grid normalized it to; when those never converged the grid
remounted on every frame. The watch now reloads at most once per distinct
desired state (the guard resets when the desired state actually changes), so a
non-converging state causes a single benign remount instead of an infinite loop.

Also guards the row-number column auto-size so it no longer calls
`applyColumnState` on an already-destroyed grid.
