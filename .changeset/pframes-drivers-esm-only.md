---
"@milaboratories/pf-spec-driver": minor
"@milaboratories/pf-driver": minor
---

Drop the `require` export condition, because both packages are ESM-only

Each package depends on `@milaboratories/pf-spec`. The generated bindings in that
package find their core WASM module with `import.meta.url`. They also instantiate the
module with a top-level await. CJS has no equivalent for either of these two operations.
Therefore the declared `require` entry point could not load these packages, either with
the classic CJS resolver or with `require()` of an ESM graph. The manifests now describe
what the packages can do.

`pf-spec-driver` also no longer re-exports the raw spec operations. It also removes its
dependency on `@milaboratories/pl-model-middle-layer`. It exports `SpecDriver`, which
adds a handle pool and wraps the errors. If you need the raw operations, depend on
`@milaboratories/pf-spec` directly. `pf-driver` now does this.
