---
"@milaboratories/pl-middle-layer": patch
---

Propagate wasm dependencies through the cached template upload path. `flattenV3Tree` in `template_cache.ts` previously skipped `tpl.wasm` entries entirely — the loadTemplateCached path (used by dev-v2 blocks and others) silently stripped wasm field declarations during upload, leaving the backend's `PlTemplateV1` resource with no `wasm/<alias>` fields. As a result `RuntimeV1.deps.Wasm` was empty at render time and `plapi.loadWasm` aborted with `alias "<id>" is not a wasm dependency of this template` even though the bytes were bundled in the block-pack. Adds `hashWasmV3`, a `processWasm` helper, and the wasm field wiring in `processTemplate`, mirroring the handling already present in `direct_template_loader_v3.ts`.
