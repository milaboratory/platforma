---
"@milaboratories/ts-builder": minor
"@milaboratories/ts-configs": minor
---

Add `block-facade` build target and facade tsconfig preset.

- ts-builder: new `--target block-facade` that bundles a facade's `src/` into a
  self-contained `dist/` (single inlined `.d.ts` + bundled `.js`, all deps
  force-inlined via `external: () => false`). Bumps `rolldown` to ^1.1.2 and
  `rolldown-plugin-dts` to ^0.26.0.
- ts-configs: new `@milaboratories/ts-configs/block/facade` preset
  (`customConditions: []` so dts-bundling reads sibling `.d.ts`, not source).
