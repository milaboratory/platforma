---
"@platforma-sdk/block-tools": patch
---

structure: address review follow-ups on the block scaffolding rules

- test scope now runs the full `ts-builder check` (type-check + lint + fmt-check) instead of type-only, with block-local `.oxlintrc.json` / `.oxfmtrc.json` and a `fmt` script — matching model/ui.
- ui declares `@types/node` as a peer dependency (mirrors model) instead of stripping it.
- drop the retired eslint leftovers: the `lint` script and `@platforma-sdk/eslint-config` dep across model/ui/test, plus its catalog entry.
- drop the vite-era `@vitejs/plugin-vue` / `vite-plugin-dts` deps and catalog entries (now owned by ts-builder).
- workflow `tsconfig.json` is scaffolded only when the workflow carries co-located tests (paired with the conditional vitest config).
- rename the root `update` script to `upgrade-sdk` (deprecated `update-sdk` kept for now).
