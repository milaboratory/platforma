---
"@platforma-sdk/tengo-builder": patch
---

MILAB-6324: gzip WASM artefacts in the template pack.

- `pl-tengo` now gzips every `.wasm` file (level 9) before base64-encoding it
  into the pack's `hashToSource`. Real wasm components compress to ~30-40 % of
  their raw size, so a `pframes-rs` build that was approaching the 2 MiB raw
  ceiling now uses a fraction of the per-WASM resource cap and the on-wire
  pack stays correspondingly smaller.
- The `MAX_WASM_FILE_BYTES` guard now applies to the gzipped payload. The
  numeric cap is unchanged (2 MiB), so the check stays in sync with the
  backend's 3 MiB value-resource limit; in practice each `.wasm` file can
  now be several MiB raw before hitting it.
- Requires a backend built from `MILAB-6324-wasm-gzip` (or later): the
  workflow controller sniffs the gzip header at precompile time and gunzips
  before handing bytes to wasmtime. Older WASM-aware backends would reject
  the gzip header as "not a valid wasm component" — there are no
  WASM-using installations in the wild yet, so no compatibility window is
  needed.
