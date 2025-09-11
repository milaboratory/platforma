# @platforma-sdk/package-builder

## 3.5.2

### Patch Changes

- 44115b4: Check image existence in remote repo first (before push)
- 44115b4: Fix autopush in ci

## 3.5.1

### Patch Changes

- 5073f31: Fix autopush in ci

## 3.5.0

### Minor Changes

- f127b97: Do not build docker images outside CI by default

## 3.4.0

### Minor Changes

- 2aa207d: Nice error messages formatting for package-builder

## 3.3.0

### Minor Changes

- ff7f75e: Allow to push docker image into alternative registry after building

## 3.2.4

### Patch Changes

- 2b6f35f: add label for images

## 3.2.3

### Patch Changes

- 7923343: Use arch-independent artifact info file when working with crossplatform package

## 3.2.2

### Patch Changes

- 2a43498: Handle wrong ref name in docker entrypoint

## 3.2.1

### Patch Changes

- 70bf87c: allow 'id-or-ref' back (BLAST example :) )

## 3.2.0

### Minor Changes

- b20daba: Do read content-addressable docker tags and store intermediate build results in dist for correct pre-compilation

## 3.1.0

### Minor Changes

- 7d7df12: Automatically publish all docker images from CI after build

## 3.0.2

### Patch Changes

- ea71001: Add lost 'assets' dir to package-builder npm package

## 3.0.1

### Patch Changes

- ae004b6: fix: docker build multiple times

## 3.0.0

### Major Changes

- c48db40: support python docker container

## 2.18.0

### Minor Changes

- 6a2e072: Put assets and software into different path prefixes

## 2.17.2

### Patch Changes

- d2ddb35: docker isn't built when pnpm build for a block was called

## 2.17.1

### Patch Changes

- 18b393a: Do not generate package.sw.json in software root

## 2.17.0

### Minor Changes

- f55c7ff: add docker artifact support

## 2.16.4

### Patch Changes

- 7b5943b: Correct deps list

## 2.16.3

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/resolve-helper@1.1.1

## 2.16.2

### Patch Changes

- 37800c5: Public tools packages

## 2.16.1

### Patch Changes

- 0dfe522: Print valid env variable name in error message about absent storage URL

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
