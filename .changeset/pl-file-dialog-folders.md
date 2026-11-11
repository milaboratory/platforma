---
"@milaboratories/uikit": minor
"@platforma-sdk/ui-vue": minor
"@milaboratories/pl-drivers": patch
---

PlFileDialog: import whole folders on the "My Computer" tab in multi-file mode by dropping them, the same way as files. Folders are walked recursively; hidden files, `__MACOSX` and files outside the allowed extensions are skipped. Single-file mode (and so PlFileInput) ignores dropped folders. The ls driver now refuses to create an import handle for a folder instead of failing later during import.
