---
"@milaboratories/pf-spec": patch
---

Update `@bytecodealliance/jco-transpile` to 0.20.0 and `@bytecodealliance/preview2-shim` to 0.30.0, the versions that pframes-rs 1.2.0 builds with (jco 1.39.0). The `preview2-shim` peer dependency is now `^0.30.0`. The generated bindings also run on `preview2-shim` 0.20, so a consumer that pins the older shim gets only a peer warning; it should still move to `^0.30.0`.
