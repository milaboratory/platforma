---
"@platforma-sdk/workflow-tengo": minor
---

Add `@platforma-sdk/workflow-tengo:pframes.build-query-wasm` — a wasm-backed counterpart to `:pframes.build-query` that routes through the `@milaboratories/pframes-rs-wasip2` component. Same public API (`buildQuery(input) -> map`), same `SpecQueryJoinEntry` shape; the wasm side is the rust source-of-truth (`pframes-rs/packages/spec/src/requests/build_query/{logic,request}.rs`). The pure-Tengo `:pframes.build-query` is unchanged and remains the entry point used by `:pframes.build-table`; opt-in to the wasm version by importing the new lib directly.
