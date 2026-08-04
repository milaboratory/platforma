---
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pl-mcp-server": patch
---

Bump `quickjs-emscripten` to 0.32.0. quickjs (wasm) is the largest worker CPU cost, and 0.32.0 upgrades the underlying bellard/quickjs and reworks host function binding onto `HostRef`.
