---
"@milaboratories/uikit": minor
"@platforma-sdk/ui-vue": minor
"@milaboratories/pl-drivers": patch
---

PlFileDialog: import whole folders on the "My Computer" tab in multi-file mode by dropping them, the same way as files. Folders are walked recursively; hidden files, `__MACOSX` and files outside the allowed extensions are skipped. On the "Remote" tab in multi-file mode, folders can be selected like files (click, Cmd/Shift-click, Cmd+A); the folder name, its arrow or a double-click opens it. A selected folder is counted in the background, and the selection label shows the number of files, not folders; Import reuses the counts, waiting for unfinished ones with cancel. A selected folder that holds nothing to import, or cannot be read, is named and blocks Import until deselected. Single-file mode (and so PlFileInput) ignores folders on both tabs. The ls driver now refuses to create an import handle for a folder instead of failing later during import.
