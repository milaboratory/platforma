---
"@milaboratories/pl-config": major
"@milaboratories/pl-deployments": major
"@milaboratories/pl-middle-layer": major
---

Remove SSH deployment of the backend. `@milaboratories/pl-deployments` (and `@milaboratories/pl-middle-layer`, which re-exports it) no longer exports `SshPl`, `SshPlConfig`, `LockProcessInfo`, `parseGlibcVersion`, `SshClient`, `SshAuthMethods`, `SshAuthMethodsResult`, `SshDirContent`, `SshExecResult` and the connection info helpers (`ConnectionInfo`, `SshPlPorts`, `PortPair`, `newConnectionInfo`, `parseConnectionInfo`, `stringifyConnectionInfo`); the `ssh2` dependency is gone. `@milaboratories/pl-config` no longer exports `generateSshPlConfigs` and its types, the YAML backend config types (`PlConfig` and the `Pl*Settings` family), `getDefaultAuthMethods`, `getLicenseValue`, `licenseEnvsForMixcr`, `licenseForConfig`, the remote storage helpers (`newRemoteConfigStoragesFS`, `newRemoteConfigStoragesMinio`, `RemoteMinioSettings`, `StorageSettings`, `StoragesSettings`), the MinIO ports mode (`PlConfigPortsCustomWithMinio`, `PortsWithMinio`) and the endpoint helpers (`Endpoints`, `withHost`, `getLocalhostEndpoints`). `createDefaultLocalStorages` takes only the working dir and returns `LocalStoragesSettings`; `Ports` lost its MinIO and local-forwarding fields. The `yaml` dependency is gone from both packages.
