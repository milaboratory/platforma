---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-model-backend": minor
"@milaboratories/pl-model-middle-layer": minor
"@platforma-sdk/block-tools": minor
"@platforma-sdk/tengo-builder": major
"@platforma-sdk/workflow-tengo": minor
---

MILAB-6145: tengo-builder learns a `wasm` artefact type; declare WASM runtime requirement on packed blocks.

- `pl-tengo` detects `assets.importWasm("@pkg:id")` in tengo sources (regex-based, like the other `import*` calls) and resolves the bytes from each dependency's `package.json` `exports[*].wasm` condition. Subpath `.` maps to id `main`; `./foo` maps to id `foo`.
- `@platforma-sdk/workflow-tengo`'s `assets` lib gains `importWasm(name)`, a thin wrapper over the new `plapi.loadWasm` host builtin. Returns the component's WIT-interface map directly — block authors index by canonical WIT interface name and JSON-marshal arguments / results at the call site. No SDK-side wrapper per consumer; the consuming file mentions the package id directly (same pattern as `importSoftware` / `importAsset`).
- `BlockPackMeta` gains `requiredCapabilities?: string[]` — Desktop matches it
  against the backend's `serverInfo.capabilities` at install time. Forward-
  compatible with old Desktops (Zod's `z.object` strips unknown keys).
- `pl-client`'s `MaintenanceAPI.Ping.Response` exposes the new `capabilities` field added in pl backend (proto field 9).
- `pl-middle-layer` exposes a `serverCapabilities` getter alongside the existing `serverPlatform`.
- `pl-tengo` enforces two build-time size guards that mirror backend ingest caps: each `.wasm` file must be ≤ 2 MiB raw (the backend stores it as a value resource, capped at 3 MiB after base64+JSON marshal), and each gzipped template pack must be ≤ ~3.4 MiB (backend `TemplatePackSizeLimit` is 3.5 MiB). Failures point at the offending artefact and, for over-large packs, list each WASM in the tree by size — so block authors see the cause at build time instead of getting an opaque "resource too large" error at publish or render.
- `pl-client`'s `TestHelpers.getTestClient` JWT cache now keys on the live backend `instanceId` in addition to address / user / password / expiration. Prevents a stale JWT issued by a previous backend run (rotated `instanceId`) being handed to the first authenticated call after a restart — the test fixture re-logs in instead of surfacing `failed to authenticate request using any of available methods`.
