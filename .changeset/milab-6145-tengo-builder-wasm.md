---
"@milaboratories/pl-model-backend": minor
"@platforma-sdk/tengo-builder": minor
"@platforma-sdk/workflow-tengo": minor
---

MILAB-6145: tengo-builder learns a `wasm` artefact type.

- `CompiledTemplateV3` gains an optional `wasm` map on `template`, mirroring
  the existing `libs` / `software` / `assets` shape. Wasm bytes are
  base64-encoded into `hashToSource[<sha256>]`, preserving the
  `hashToSource[hash] === stored value` invariant.
- `pl-tengo` detects `assets.importWasm("@pkg:id")` in tengo sources
  (regex-based, like the other `import*` calls) and resolves the bytes
  from each dependency's `package.json` `exports[*].wasm` condition.
  Subpath `.` maps to id `main`; `./foo` maps to id `foo`. A node_modules
  fallback handles wasm-only packages that don't expose a JS entry point.
- `@platforma-sdk/workflow-tengo` ships a new opt-in lib
  `:pframes-rs` that wraps `assets.importWasm("@milaboratories/pframes-rs-wasip2:main")`.
  Blocks that import `:pframes-rs` automatically pull the 1.7 MB pframes-rs
  wasm into their templates' packs; blocks that don't stay lean.
