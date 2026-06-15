---
"@milaboratories/ts-builder": patch
---

Pin `vue-tsc` to `3.2.6`. vue-tsc 3.3.3+ regressed `UnwrapNestedRefs` resolution over inferred generics, which breaks `@platforma-sdk/ui-vue`'s `AppV3` typing — returned `ref`/`computed` app fields stop type-unwrapping, surfacing as false-positive `TS2322`/`TS7053` in blocks while the runtime is correct.
