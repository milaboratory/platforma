---
"@platforma-sdk/block-tools": patch
---

structure: several block-compat improvements distributed to every migrated block.

- **Derive the catalog `vue` pin from `@platforma-sdk/ui-vue`** via a new `pinCatalogToDependencyOf` builder: it reads the exact `vue` version ui-vue declares (at npm-latest, or a given `ofVersion`) and OVERWRITES the block's catalog entry, so a loose `vue: ^3.5.x` is tightened to match the SDK. This prevents the two-vue-instance mismatch that broke `AppV3`/`SdkPluginV3` typing. Replaces the add-if-absent `vue` floor (which never tightened a pre-existing loose pin).
- **Conditional `vitest`**: the `vitest` devDep (model/ui/workflow) and the workflow `vitest.config.mts` are now wired only when a package carries co-located tests (added when present, removed when absent), matching the existing conditional `test` script.
- **Cruft cleanup**: drop vite/tsup/vue-tsc-era artefacts — catalog entries (`vite`, `tsup`, `vue-tsc`), the ui `vite` dep + `preview` script, and the model `tsup`/`vite` deps + top-level `tsup` config block.
- **`update` script**: add a second `pnpm i` after the structural refresh so a first migration installs the newly-added devDeps (ts-builder/oxlint/oxfmt) before `pnpm fmt`.
