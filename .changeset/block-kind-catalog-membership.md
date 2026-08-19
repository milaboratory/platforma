---
"@platforma-sdk/block-tools": patch
---

Add `@platforma-sdk/block-kind` to the SDK catalog membership list.

The kind rule requires the dependency as `sdk:`, which resolves to `catalog:` for a
standalone block, but `block-kind` was absent from `SDK_CATALOG_PACKAGES` — the only
list the catalog machinery reads. Nothing seeded the key on `init`, and
`structure refresh --update-deps-only` had no registry lookup for it, so the version
was never resolved or bumped. Blocks migrated to structure v2 carried a hand-written
pin instead, which broke `pnpm install` once that release left the registry.
