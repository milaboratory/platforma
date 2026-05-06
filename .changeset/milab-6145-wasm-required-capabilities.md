---
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/block-tools": minor
---

MILAB-6145: declare WASM runtime requirement on packed blocks.

- `BlockPackMeta` gains `requiredCapabilities?: string[]` — Desktop matches it
  against the backend's `serverInfo.capabilities` at install time. Forward-
  compatible with old Desktops (Zod's `z.object` strips unknown keys).
- `block-tools pack` hardcodes `requiredCapabilities: ["wasm"]` for every
  block built with this SDK release.
- `pl-client`'s `MaintenanceAPI.Ping.Response` exposes the new
  `capabilities` field added in pl backend (proto field 9).
- `pl-middle-layer` exposes a `serverCapabilities` getter alongside the
  existing `serverPlatform`.

See `docs/text/work/projects/webassembly-libraries-tengo/wasm-bundling.md`
for the full design.
