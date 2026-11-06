---
"@milaboratories/pl-middle-layer": major
"@milaboratories/pl-drivers": major
"@platforma-sdk/test": patch
"@platforma-sdk/bootstrap": patch
---

Remove support for the Desktop App built-in backend. `@milaboratories/pl-deployments`, `@milaboratories/pl-config` and `@milaboratories/pl-healthcheck` are no longer published; `@milaboratories/pl-middle-layer` no longer re-exports `@milaboratories/pl-deployments`. The `localProjections` option is removed from the middle layer and driver kit options, `createDownloadClient` and `LsDriver.init` no longer take local projections, and `ClientDownload` no longer reads `storage://` URLs from the local disk: `LocalStorageProjection`, `parseLocalUrl`, `getFullPath`, `newLocalStorageIdsToRoot`, `WrongLocalFileUrl` and `UnknownStorageError` are gone. The LS driver always creates upload handles for local files and lists a data library with id `root` like any other. `pl-dev` keeps the default backend version in its own `pl-version`.
