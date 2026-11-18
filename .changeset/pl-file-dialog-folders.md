---
"@milaboratories/uikit": minor
"@platforma-sdk/ui-vue": minor
"@milaboratories/pl-drivers": patch
---

PlFileDialog: import whole folders on the "My Computer" tab in multi-file mode by dropping them, the same way as files. Folders are walked recursively; hidden files, `__MACOSX` and files outside the allowed extensions are skipped. On the "Remote" tab in multi-file mode, folders can be selected like files (click, Cmd/Shift-click, Cmd+A); the folder name, its arrow or a double-click opens it. Selected folders are expanded into their files on Import, with progress and cancel; a selected folder that holds nothing to import is named and the dialog stays open. Single-file mode (and so PlFileInput) ignores folders on both tabs. The ls driver now refuses to create an import handle for a folder instead of failing later during import.
