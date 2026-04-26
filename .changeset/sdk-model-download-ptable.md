---
"@platforma-sdk/model": minor
"@milaboratories/pl-model-common": minor
---

Expose native PTable download via `PFrameDriver.downloadPTable(handle, options)` (optional, present only in the desktop runtime). `DownloadPTableCsvOptions` moved to `@milaboratories/pl-model-common`. The earlier `PlatformaV3.downloadPTableCsv` bridge is removed in favor of the driver-level method.
