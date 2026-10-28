---
"@milaboratories/pf-spec": patch
---

Update `@bytecodealliance/jco-transpile` to 0.20.0 and `@bytecodealliance/preview2-shim` to 0.30.0, the versions that jco 1.39.0, the pframes-rs 1.2.0 toolchain, uses. The `preview2-shim` peer dependency is now `^0.30.0`; consumers that pin their own `preview2-shim` (the desktop app) need the same range.
