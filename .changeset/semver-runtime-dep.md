---
"@milaboratories/pl-middle-layer": patch
---

Move `semver` from devDependencies to dependencies — it is imported at runtime by `block_registry/watcher.ts`. As a devDependency it was a phantom dependency: consumers like `@platforma-sdk/pl-cli` failed with `MODULE_NOT_FOUND: Cannot find package 'semver'` under pnpm 11's global virtual store (`pnpm dlx`), where ESM imports cannot resolve undeclared packages via hoisting.
