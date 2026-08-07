# @milaboratories/ts-configs

## 1.4.0

### Minor Changes

- da11734: Allow `.ts` extension imports in all targets, and not only in the browser target

  `allowImportingTsExtensions` moves from `tsconfig.browser.json` to
  `tsconfig.base.json`. Therefore node projects and isomorphic projects can also
  write `import … from "./sibling.ts"`. The browser config no longer needs its own
  copy of the flag, so this change removes it. This change also removes
  `emitDeclarationOnly: false` from `blocks/tsconfig.facade.json`. Both files now
  inherit the same value from the base config.

  `blocks/tsconfig.facade.json` also drops `noEmit: false`. Nothing used that
  setting. `rolldown-plugin-dts` makes the facade's declarations, and `ts-builder
type-check` passes `--noEmit` explicitly. The setting would also conflict with
  the newly inherited `allowImportingTsExtensions`. TypeScript permits that flag
  only for projects that do not emit. Editors and a direct `tsc -p` run would
  therefore report TS5096 for every block's facade package, while the CLI
  continued to pass.

## 1.3.1

### Patch Changes

- 27600c3: Escape including label columns for non primary columns

## 1.3.0

### Minor Changes

- 534a237: Add `block-facade` build target and facade tsconfig preset.

  - ts-builder: new `--target block-facade` that bundles a facade's `src/` into a
    self-contained `dist/` (single inlined `.d.ts` + bundled `.js`, all deps
    force-inlined via `external: () => false`). Bumps `rolldown` to ^1.1.2 and
    `rolldown-plugin-dts` to ^0.26.0.
  - ts-configs: new `@milaboratories/ts-configs/block/facade` preset
    (`customConditions: []` so dts-bundling reads sibling `.d.ts`, not source).

## 1.2.3

### Patch Changes

- cad9688: Fix "go to definition" + update build deps

## 1.2.2

### Patch Changes

- 79156bc: fix dense axis

## 1.2.1

### Patch Changes

- a6ea24f: silent ci tests

## 1.2.0

### Minor Changes

- 25fd324: Standardize block build tooling with explicit targets and config exports

  - Add `block-ui` and `block-test` targets to ts-builder
  - `block-ui`: Uses Vite for building, vue-tsc for type-checking
  - `block-test`: Type-check only, errors on build attempt
  - Add clean export aliases for ts-configs: `block/model`, `block/ui`, `block/test`
  - Add `test` export to eslint-config with vitest globals
  - Create dedicated config files for each block target (tsconfig and vite/rollup configs)

## 1.1.0

### Minor Changes

- 4a90a47: correct usage use-sources for typecheck command

## 1.0.6

### Patch Changes

- 3f93434: Packages configuration normalization

## 1.0.5

### Patch Changes

- c29b40f: use uniq custom condition

## 1.0.4

### Patch Changes

- 37800c5: Public tools packages
