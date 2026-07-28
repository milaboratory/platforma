---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-drivers": minor
"@milaboratories/uikit": minor
"@platforma-sdk/ui-vue": patch
---

File dialog: select files across folders, and list sub-folders in one pass.

Sequencer output usually arrives as one folder per sample. Picking it apart in `PlFileDialog` meant descending into each folder separately, because the selection was stored on the row objects and every folder change replaced them — so files from two folders could not be selected together at all.

- `PlFileDialog`: the selection now lives in a path-keyed map and survives navigation. Descend, `⌘A`, descend, `⌘A` builds one selection; the header counter reports the whole of it and offers a `Clear`. Entering a folder no longer wipes the selection (the directory row's click was reaching the container's deselect handler).
- Deselection: ctrl/⌘-click removes one file, clicking empty list space clears the folder on screen, `Clear` clears everything — all three now documented in the shortcuts tooltip. Navigating via a breadcrumb, or opening that tooltip, no longer deselects; both were reaching the container's deselect handler.
- `ListFilesResult.depth` echoes the depth actually applied. Blocks bundle their own copy of this dialog but call the *host's* `lsDriver`, so a new dialog against an older host is routine; that host echoes no `depth`, and the dialog hides the "Include subfolders" control instead of leaving a silent no-op.
- `LsDriver.listFiles` takes an optional `{ depth, limit }`. `depth` walks that many directory levels breadth-first and reports the files it finds, keeping the browsed level's directories so navigation still works; `limit` (default 5000) caps the walk and flags the result `truncated` rather than silently returning a partial listing. Unreadable directories are counted in `unreadableDirs` and stepped over. Omitting the options is the previous single-level behaviour, exactly.
- `collectListFiles` is exported from `pl-model-common` as the one definition of what `depth` means, shared by the driver and the UI mock.
- The dialog gains an "Include subfolders" control, labels nested rows by their path below the folder being browsed, and — when a folder holds nothing but folders — offers to list what is inside them.
