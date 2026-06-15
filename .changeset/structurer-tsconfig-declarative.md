---
"@platforma-sdk/block-tools": patch
---

structure: declare the block tsconfig as a `fixed` file with two static end states (with / without node ambient types), chosen by a `when`/else on co-located-test presence, instead of an imperative `managed` body. This fixes a first-pass `RecheckError` (non-idempotent rule set) on test-bearing blocks migrating off a legacy tsconfig, and adds an optional `else` branch to `when`. Also drops the vestigial `vue-tsc` devDep from the migrated ui (ts-builder owns vue-tsc).
