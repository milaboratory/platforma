---
"@platforma-sdk/tengo-builder": minor
"@milaboratories/pl-client": patch
"@milaboratories/pl-model-backend": patch
---

Templates that embed a wasm component now require the `wasm:v2` backend capability instead of `wasm:v1`. Components built with Rust 1.100 or newer import `wasi:cli/exit` `exit-with-code` and run `_initialize` at instantiation; only backends that advertise `wasm:v2` load them. The middle layer refuses to add or update such a block on an older backend. `BackendCapability` gains `wasm:v2`.
