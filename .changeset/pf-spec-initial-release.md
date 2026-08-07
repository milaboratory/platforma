---
"@milaboratories/pf-spec": major
---

Initial release

This package gives the spec-plane PFrame operations, and it binds to the pframes WASM
component. It contains the `PFrame` class. It also contains the stateless operations
`expandAxes`, `collapseAxes`, `findAxis`, `findTableColumn`, `buildQuery` and
`rewriteLegacyFilters`.

The pframes-rs repo published this code before, as `@milaboratories/pframes-rs-wasm`.
That repo still ships the component itself, as `@milaboratories/pframes-rs-wasip2`.
This package transpiles the component with jco at build time. Therefore a consumer gets
the bindings and does not need a Rust toolchain.

The package is ESM-only. The generated bindings find their core module with
`import.meta.url`. They also instantiate the component with a top-level await. CJS has
no equivalent for either of these two operations. `@bytecodealliance/preview2-shim` is a
peer dependency. Therefore a consumer resolves exactly one copy of the WASI host.
