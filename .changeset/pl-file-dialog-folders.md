---
"@milaboratories/uikit": minor
"@platforma-sdk/ui-vue": minor
"@milaboratories/pl-drivers": patch
---

PlFileDialog: new `allowFolders` prop (off by default) lets a multi-file dialog import whole folders. On the "My Computer" tab they are dropped, the same way as files. Folders are walked recursively; hidden files, system entries (`__MACOSX`, `$RECYCLE.BIN`, `System Volume Information`, `lost+found`, `Thumbs.db`, `desktop.ini`, Office `~$` lock files) and files outside the allowed extensions are skipped, on both tabs. On the "Remote" tab in multi-file mode, folders can be selected like files (click, Cmd/Shift-click, Cmd+A); the folder name, its arrow or a double-click opens it. A selected folder is counted in the background, and the selection label shows the number of files, not folders; Import reuses the counts, waiting for unfinished ones with cancel. A selected folder that holds nothing to import, or cannot be read, is named and blocks Import until deselected. Without `allowFolders`, or in single-file mode (and so PlFileInput), folders are not imported on either tab, as before. PlFileDialog reports through callback props instead of emitted events; `v-model` and `@import:files` keep working unchanged. The ls driver now refuses to create an import handle for a folder instead of failing later during import.
