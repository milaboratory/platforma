---
'@milaboratories/ts-builder': minor
'@milaboratories/ts-configs': minor
'@platforma-sdk/eslint-config': minor
---

Standardize block build tooling with explicit targets and config exports

- Add `block-ui` and `block-test` targets to ts-builder
- `block-ui`: Uses Vite for building, vue-tsc for type-checking
- `block-test`: Type-check only, errors on build attempt
- Add clean export aliases for ts-configs: `block/model`, `block/ui`, `block/test`
- Add `test` export to eslint-config with vitest globals
- Create dedicated config files for each block target (tsconfig and vite/rollup configs)
