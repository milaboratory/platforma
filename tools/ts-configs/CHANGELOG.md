# @milaboratories/ts-configs

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
