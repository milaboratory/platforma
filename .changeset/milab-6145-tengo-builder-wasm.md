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
- `@platforma-sdk/workflow-tengo` ships a new opt-in lib `:pframes-rs` that wraps `assets.importWasm("@milaboratories/pframes-rs-wasip2:main")`. Blocks that import `:pframes-rs` automatically pull the 1.7 MB pframes-rs wasm into their templates' packs; blocks that don't stay lean.
- `BlockPackMeta` gains `requiredCapabilities?: string[]` — Desktop matches it
  against the backend's `serverInfo.capabilities` at install time. Forward-
  compatible with old Desktops (Zod's `z.object` strips unknown keys).
- `pl-client`'s `MaintenanceAPI.Ping.Response` exposes the new `capabilities` field added in pl backend (proto field 9).
- `pl-middle-layer` exposes a `serverCapabilities` getter alongside the existing `serverPlatform`.
- `pl-tengo` enforces two build-time size guards that mirror backend ingest caps: each `.wasm` file must be ≤ 2 MiB raw (the backend stores it as a value resource, capped at 3 MiB after base64+JSON marshal), and each gzipped template pack must be ≤ ~3.4 MiB (backend `TemplatePackSizeLimit` is 3.5 MiB). Failures point at the offending artefact and, for over-large packs, list each WASM in the tree by size — so block authors see the cause at build time instead of getting an opaque "resource too large" error at publish or render.