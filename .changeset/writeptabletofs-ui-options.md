---
"@milaboratories/pl-model-common": minor
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
"@milaboratories/pf-driver": patch
---

Replace legacy `PFrameDriver.writePTableToFs?` with two modern services:
`Dialog.showSaveDialog` (new `main`-kind service for native save dialogs)
and `PFrame.writePTableToFs` (now a required method on the UI-facing
driver, accepting a caller-provided `path`). `exportCsv` in `ui-vue`
now opens the save dialog and invokes the write as two separate
service calls.
