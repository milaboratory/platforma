---
"@platforma-sdk/ui-vue": patch
---

Stop `PlAgDataTableV2` recreating its grid forever when the stored grid state
records hidden columns but no column order — around twenty rebuilds a second,
which strobes the headers and fills the console with AG Grid licence banners.

Three things were needed to produce it, and each is addressed:

- AG Grid reports an entirely empty state until its columns have been taken into
  its own state, and `normalizeGridState` reads the live columns — so
  normalizing an empty report invented a state (hidden columns, no column order)
  that the grid would never report back. An empty report is now ignored.
- The reload watch compared the whole state, but the stored state is a partial
  opinion while AG Grid always reports all of it. A stored state with no
  `columnOrder` could therefore never match a grid that has columns, and no
  remount could ever make it. Only the fields the stored state actually
  expresses are compared now (`storedStateApplied`, unit tested).
- `onStateUpdated` is what would repair the stored state, but AG Grid defers its
  init state event by a timeout and drops it if the grid has since been
  destroyed — so the remounts starved their own cure. The watch now gives up
  after a few reloads in a second: a stale column layout is a far smaller cost
  than an unusable table.

Also stops a grid-state change that leaves `pTableParams` untouched — reordering
columns, say — from being silently dropped: the state cache was spliced in
place, so the change check compared the new state against itself and skipped the
write back to the project.
