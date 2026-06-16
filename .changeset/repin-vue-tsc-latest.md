---
"@milaboratories/ts-builder": patch
---

Pin `vue-tsc` to `3.3.5` (latest), replacing the earlier `3.2.6` pin. The `3.2.6` pin was made on the premise that vue-tsc 3.3.3+ regressed `UnwrapNestedRefs` over inferred generics; re-investigation against a fully-bumped block showed that diagnosis was a false lead (the earlier bisect was confounded by the SDK model version — the failing block reports identical errors on every vue-tsc version *and* on older ui-vue). vue-tsc is kept pinned for build reproducibility, but to the latest version rather than an arbitrary older one.
