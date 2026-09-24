# @milaboratories/pf-spec

## 1.0.5

### Patch Changes

- Updated dependencies [cadf144]
  - @milaboratories/pl-model-common@1.51.0
  - @milaboratories/pl-model-middle-layer@1.33.0

## 1.0.4

### Patch Changes

- Updated dependencies [3716dcb]
  - @milaboratories/pl-model-common@1.50.0
  - @milaboratories/pl-model-middle-layer@1.32.2

## 1.0.3

### Patch Changes

- 31a3f60: Update pframes-rs-node, pframes-rs-wasip2, and polars-pf to 1.1.61. The Linux pframes-rs-node addon no longer ships debug info. Its download shrinks from 208 MB to about 28 MB. Bump runenv-python-3 to 1.13.2, which bundles polars-pf 1.1.61 for ptabler.

## 1.0.2

### Patch Changes

- f2ed96c: Update pframes-rs-node, pframes-rs-wasip2, and polars-pf to 1.1.60. Wide tables with hundreds of same-axis columns no longer overflow the engine thread stack (balanced join fold).
- Updated dependencies [e8f26d6]
  - @milaboratories/pl-model-common@1.49.0
  - @milaboratories/pl-model-middle-layer@1.32.1

## 1.0.1

### Patch Changes

- Updated dependencies [80a9963]
  - @milaboratories/pl-model-common@1.48.0
  - @milaboratories/pl-model-middle-layer@1.32.0

## 1.0.0

### Major Changes

- da11734: Initial release

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

### Patch Changes

- Updated dependencies [da11734]
  - @milaboratories/pl-model-middle-layer@1.31.0
  - @milaboratories/pl-model-common@1.47.3
