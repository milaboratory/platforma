# @milaboratories/ts-builder

## 1.2.3

### Patch Changes

- Updated dependencies [3b11738]
  - @milaboratories/build-configs@1.3.0

## 1.2.2

### Patch Changes

- Updated dependencies [fc8c6d3]
  - @milaboratories/build-configs@1.2.2

## 1.2.1

### Patch Changes

- 1eb721e: annotations default value
- Updated dependencies [1eb721e]
  - @milaboratories/build-configs@1.2.1

## 1.2.0

### Minor Changes

- 25fd324: Standardize block build tooling with explicit targets and config exports

  - Add `block-ui` and `block-test` targets to ts-builder
  - `block-ui`: Uses Vite for building, vue-tsc for type-checking
  - `block-test`: Type-check only, errors on build attempt
  - Add clean export aliases for ts-configs: `block/model`, `block/ui`, `block/test`
  - Add `test` export to eslint-config with vitest globals
  - Create dedicated config files for each block target (tsconfig and vite/rollup configs)

### Patch Changes

- Updated dependencies [25fd324]
  - @milaboratories/build-configs@1.2.0
  - @milaboratories/ts-configs@1.2.0

## 1.1.1

### Patch Changes

- 9e496f1: use custom typescript declaration for model separate bundle
- Updated dependencies [9e496f1]
  - @milaboratories/build-configs@1.1.1

## 1.1.0

### Minor Changes

- 4a90a47: correct usage use-sources for typecheck command

### Patch Changes

- Updated dependencies [4a90a47]
  - @milaboratories/build-configs@1.1.0
  - @milaboratories/ts-configs@1.1.0

## 1.0.6

### Patch Changes

- 92439e1: ts-builder ignore customcudition for build/serve without flag
- Updated dependencies [92439e1]
  - @milaboratories/build-configs@1.0.9

## 1.0.5

### Patch Changes

- 6f85a52: windows friendly runner

## 1.0.4

### Patch Changes

- Updated dependencies [215c50b]
  - @milaboratories/build-configs@1.0.8

## 1.0.3

### Patch Changes

- Updated dependencies [ee5f3ad]
  - @milaboratories/build-configs@1.0.7

## 1.0.2

### Patch Changes

- 69ed569: update resolver to bin commands

## 1.0.1

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/build-configs@1.0.6
  - @milaboratories/ts-configs@1.0.6
