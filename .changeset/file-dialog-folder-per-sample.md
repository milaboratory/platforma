---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-drivers": minor
"@milaboratories/uikit": minor
"@platforma-sdk/ui-vue": patch
---

File dialog: select files across folders, and list sub-folders in one pass.

Sequencer output usually arrives as one folder per sample. Picking it apart in `PlFileDialog` meant descending into each folder separately, because the selection was stored on the row objects and every folder change replaced them — so files from two folders could not be selected together at all.

- `PlFileDialog`: the selection now lives in a path-keyed map and survives navigation. Descend, `⌘A`, descend, `⌘A` builds one selection; the header counter reports the whole of it and offers a `Clear`. Entering a folder no longer wipes the selection (the directory row's click was reaching the container's deselect handler).
- `LsDriver.listFiles` takes an optional `{ depth, limit }`. `depth` walks that many directory levels breadth-first and reports the files it finds, keeping the browsed level's directories so navigation still works; `limit` (default 5000) caps the walk and flags the result `truncated` rather than silently returning a partial listing. Unreadable directories are counted in `unreadableDirs` and stepped over. Omitting the options is the previous single-level behaviour, exactly.
- `collectListFiles` is exported from `pl-model-common` as the one definition of what `depth` means, shared by the driver and the UI mock.
- The dialog gains an "Include subfolders" control, labels nested rows by their path below the folder being browsed, and — when a folder holds nothing but folders — offers to list what is inside them.
