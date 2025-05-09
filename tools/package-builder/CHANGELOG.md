# @platforma-sdk/package-builder

## 2.16.0

### Minor Changes

- acc83d2: Allow to choose custom package.json path from CLI options

## 2.15.6

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

## 2.15.5

### Patch Changes

- Updated dependencies [af43efe]
  - @milaboratories/resolve-helper@1.1.0

## 2.15.4

### Patch Changes

- 76f3d78: Don't require r-version in software. Require it in environment

## 2.15.3

### Patch Changes

- 5f42d42: Require 'r-version' field in R environment artifact declaration

## 2.15.2

### Patch Changes

- e06efcd: Pin and standardize dependency versions for network and utility libraries to ensure consistent builds and prevent unexpected behavior from minor version changes. Changes include:

  - Pin `@protobuf-ts/*` packages to version 2.9.4 using YAML anchors
  - Pin AWS SDK packages to version 3.750.0
  - Change `undici` from `^7.2.3` to `~7.2.3` (only patch updates)
  - Change `@grpc/grpc-js` from `^1.12.6` to `~1.12.6` (only patch updates)
  - Change `cacheable-lookup` from `^6.1.0` to `~6.1.0` (only patch updates)
  - Change `canonicalize` from `^2.0.0` to `~2.0.0` (only patch updates)
  - Pin `quickjs-emscripten` to exact version 0.31.0

## 2.15.1

### Patch Changes

- d1f4acf: Network lib upgrade

## 2.15.0

### Minor Changes

- 4fc63d8: breaking change: package builder: cmd -> command; workflow-tengo: exec expressionRefs

## 2.14.2

### Patch Changes

- 0d34428: publish packages by default, not descriptors

## 2.14.1

### Patch Changes

- f8e40c7: Do not try to load list of entrypoints from absent directories

## 2.14.0

### Minor Changes

- ec3a952: Skip existing packages reupload by default

## 2.13.0

### Minor Changes

- a1b295e: Entrypoint references support: now entrypoint catalogues are made easier

## 2.12.0

### Minor Changes

- a5100ac: PFrames case insensitive filters

## 2.11.1

### Patch Changes

- c005c21: Switch to multipart upload for large packages

## 2.11.0

### Minor Changes

- dbabd17: Enable R support

## 2.10.7

### Patch Changes

- 1b9a226: Fixes asset package name during package signing

## 2.10.6

### Patch Changes

- 50f7459: Dep upgrade, vitest in particular

## 2.10.5

### Patch Changes

- 2684ebc: Add default settings for well-known registries

## 2.10.4

### Patch Changes

- c8a7c81: Make package builder to use .as.json suffix for built assets

## 2.10.3

### Patch Changes

- 6299770: Use HeadObject to check we have access to bucket

## 2.10.2

### Patch Changes

- fb9ed15: Teach tengo builder to find assets and detect asset imports

## 2.10.1

### Patch Changes

- f2a5f70: Correct way to handle S3 init exceptions. Print all unhandled error stacktraces to command output

## 2.10.0

### Minor Changes

- 006d5c0: Build and publish assets as .zip archives

## 2.9.2

### Patch Changes

- b22072c: bring back lost 'build commands

## 2.9.1

### Patch Changes

- d4dce67: Bring back lost commands to package-builder

## 2.9.0

### Minor Changes

- 1443049: For registries with non-alnum chars in name, use env var only with '\_'

## 2.8.2

### Patch Changes

- 7cd0fa6: regression: add missing commands after transfering to monorepo

## 2.8.1

### Patch Changes

- a9013c7: avoid ENOENT error when building new pl package
