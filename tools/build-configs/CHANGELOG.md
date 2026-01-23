# @milaboratories/build-configs

## 1.3.0

### Minor Changes

- 3b11738: Update for vitest config

## 1.2.2

### Patch Changes

- fc8c6d3: avoid duplicated css

## 1.2.1

### Patch Changes

- 1eb721e: annotations default value

## 1.2.0

### Minor Changes

- 25fd324: Standardize block build tooling with explicit targets and config exports

  - Add `block-ui` and `block-test` targets to ts-builder
  - `block-ui`: Uses Vite for building, vue-tsc for type-checking
  - `block-test`: Type-check only, errors on build attempt
  - Add clean export aliases for ts-configs: `block/model`, `block/ui`, `block/test`
  - Add `test` export to eslint-config with vitest globals
  - Create dedicated config files for each block target (tsconfig and vite/rollup configs)

## 1.1.1

### Patch Changes

- 9e496f1: use custom typescript declaration for model separate bundle

## 1.1.0

### Minor Changes

- 4a90a47: correct usage use-sources for typecheck command

## 1.0.9

### Patch Changes

- 92439e1: ts-builder ignore customcudition for build/serve without flag

## 1.0.8

### Patch Changes

- 215c50b: avoid nested node_modules

## 1.0.7

### Patch Changes

- ee5f3ad: configurable output dit

## 1.0.6

### Patch Changes

- 3f93434: Packages configuration normalization

## 1.0.5

### Patch Changes

- c29b40f: use uniq custom condition

## 1.0.4

### Patch Changes

- 37800c5: Public tools packages

## 1.0.3

### Patch Changes

- a505bdb: Upgrade network and tool dependencies:
  - undici: ~7.4.0 → ~7.5.0
  - @grpc/grpc-js: ~1.12.6 → ~1.13.1
  - @protobuf-ts/plugin: 2.9.5 → 2.9.6
  - @aws-sdk/client-s3: 3.758.0 → 3.775.0
  - lru-cache: ^11.0.2 → ^11.1.0
  - yaml: ^2.6.1 → ^2.7.0
  - remeda: ^2.21.1 → ^2.21.2
  - vite-plugin-dts: ^4.4.0 → ^4.5.3
  - eslint: ^9.22.0 → ^9.23.0
  - @vitejs/plugin-vue: ^5.2.1 → ^5.2.3

## 1.0.2

### Patch Changes

- 8c0d6fe: Bundle pl-version in pl-config

## 1.0.1

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
