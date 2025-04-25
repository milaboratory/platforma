# @milaboratories/pl-config

## 1.4.8

### Patch Changes

- Updated dependencies [5240867]
  - @milaboratories/ts-helpers@1.1.7

## 1.4.7

### Patch Changes

- Updated dependencies [56d021e]
  - @milaboratories/ts-helpers@1.1.6

## 1.4.6

### Patch Changes

- 0840772: limit GOMAXPROCS everywhere

## 1.4.5

### Patch Changes

- 9e9a70f: Configure eslint to all "node" packages
- Updated dependencies [9e9a70f]
  - @milaboratories/ts-helpers@1.1.5

## 1.4.4

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
  - @milaboratories/ts-helpers@1.1.4

## 1.4.3

### Patch Changes

- e06efcd: Pin and standardize dependency versions for network and utility libraries to ensure consistent builds and prevent unexpected behavior from minor version changes. Changes include:

  - Pin `@protobuf-ts/*` packages to version 2.9.4 using YAML anchors
  - Pin AWS SDK packages to version 3.750.0
  - Change `undici` from `^7.2.3` to `~7.2.3` (only patch updates)
  - Change `@grpc/grpc-js` from `^1.12.6` to `~1.12.6` (only patch updates)
  - Change `cacheable-lookup` from `^6.1.0` to `~6.1.0` (only patch updates)
  - Change `canonicalize` from `^2.0.0` to `~2.0.0` (only patch updates)
  - Pin `quickjs-emscripten` to exact version 0.31.0

## 1.4.2

### Patch Changes

- 467a150: ssh: option for global access

## 1.4.1

### Patch Changes

- Updated dependencies [a77b40a]
  - @milaboratories/ts-helpers@1.1.4

## 1.4.0

### Minor Changes

- dc94ca3: pl-deployments: add ssh support

## 1.3.3

### Patch Changes

- Updated dependencies [dac7e27]
  - @milaboratories/ts-helpers@1.1.3

## 1.3.2

### Patch Changes

- Updated dependencies [3dd3a5c]
  - @milaboratories/ts-helpers@1.1.2

## 1.3.1

### Patch Changes

- Updated dependencies [75b1646]
  - @milaboratories/ts-helpers@1.1.1

## 1.3.0

### Minor Changes

- d9f6d13: Major refactoring
  Information about default pl version moved to pl-local

## 1.2.7

### Patch Changes

- 0899a98: Relese pl=1.14.7 to UI and bootstrap
- Updated dependencies [9e6e912]
  - @milaboratories/ts-helpers@1.1.0

## 1.2.6

### Patch Changes

- 7207876: fix ml paths

## 1.2.5

### Patch Changes

- 2716eb1: fix storages

## 1.2.4

### Patch Changes

- dddf97f: bump pl version, change pl-bootstrap to get pl-version from pl-config

## 1.2.3

### Patch Changes

- 8c0d6fe: Bundle pl-version in pl-config
- d6edf35: add do-pack
  - @milaboratories/ts-helpers@1.0.30

## 1.2.2

### Patch Changes

- pl-config: remove ml dep, add more auths

## 1.2.1

### Patch Changes

- Updated dependencies [36736de]
  - @milaboratories/pl-middle-layer@1.10.45

## 1.2.0

### Minor Changes

- e546f86: integration test for pl-config, pl-local and ml

### Patch Changes

- Updated dependencies [7a04201]
- Updated dependencies [7a04201]
  - @milaboratories/ts-helpers@1.0.30
  - @milaboratories/pl-middle-layer@1.10.44

## 1.1.0

### Minor Changes

- 5f57a27: pl-config initial

### Patch Changes

- Updated dependencies [23215d9]
  - @milaboratories/pl-middle-layer@1.10.43
