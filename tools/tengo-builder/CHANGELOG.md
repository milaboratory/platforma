# @platforma-sdk/tengo-builder

## 2.1.1

### Patch Changes

- Updated dependencies [56d021e]
  - @milaboratories/ts-helpers@1.1.6

## 2.1.0

### Minor Changes

- 6506dec: templates: support v3 version where we store source code in a hash map rather than in every leaf of the template tree. It will help a lot with build times and loading times of "Add Block" button

### Patch Changes

- Updated dependencies [6506dec]
  - @milaboratories/pl-model-backend@1.1.0

## 2.0.3

### Patch Changes

- Updated dependencies [2e8b782]
  - @milaboratories/pl-model-backend@1.0.4

## 2.0.2

### Patch Changes

- Updated dependencies [4812a12]
  - @milaboratories/pl-model-backend@1.0.3

## 2.0.1

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
  - @milaboratories/pl-model-backend@1.0.2

## 2.0.0

### Major Changes

- af43efe: Fixes dependency resolution logic (now it is closer to what it supposed to be, better utilizing node's resolve mechanism)

### Patch Changes

- Updated dependencies [af43efe]
  - @milaboratories/resolve-helper@1.1.0

## 1.19.2

### Patch Changes

- 8e5de8b: Provide 'math' and 'hex' in pl-tengo check

## 1.19.1

### Patch Changes

- 7ba7308: Important fix for inline comment matching

## 1.19.0

### Minor Changes

- 2c75b72: Now comment lines are removed during compilation to save space

## 1.18.0

### Minor Changes

- 38bdbc1: Provide 'math' and 'hex' packages in pl-tengo check

## 1.17.8

### Patch Changes

- e06efcd: Pin and standardize dependency versions for network and utility libraries to ensure consistent builds and prevent unexpected behavior from minor version changes. Changes include:

  - Pin `@protobuf-ts/*` packages to version 2.9.4 using YAML anchors
  - Pin AWS SDK packages to version 3.750.0
  - Change `undici` from `^7.2.3` to `~7.2.3` (only patch updates)
  - Change `@grpc/grpc-js` from `^1.12.6` to `~1.12.6` (only patch updates)
  - Change `cacheable-lookup` from `^6.1.0` to `~6.1.0` (only patch updates)
  - Change `canonicalize` from `^2.0.0` to `~2.0.0` (only patch updates)
  - Pin `quickjs-emscripten` to exact version 0.31.0

- Updated dependencies [e06efcd]
  - @milaboratories/pl-model-backend@1.0.2

## 1.17.7

### Patch Changes

- ee1eb99: Use fresher version of tengo-tester package to check tengo scripts (largeer buffer size + more informative error report)

## 1.17.6

### Patch Changes

- f5f8f00: Linter code changes and tiny fixes in command help messages

## 1.17.5

### Patch Changes

- 87790da: Middle layer now renders template tree on its own instead of uploading template pack to the server
- Updated dependencies [87790da]
  - @milaboratories/pl-model-backend@1.0.1

## 1.17.4

### Patch Changes

- 69b15fe: Increased compression level in compiled templates

## 1.17.3

### Patch Changes

- b5ff687: Use fresher version of tengo-tester with recursive search

## 1.17.2

### Patch Changes

- 7034bdb: Produce correct library import names when facing deep index.lib.tengo file (depth > 1)

## 1.17.1

### Patch Changes

- a974567: Strict tengo compiler options control

## 1.17.0

### Minor Changes

- 3098292: Add compiler options (//tengo:<option>) with hash_override as the first option available

## 1.16.1

### Patch Changes

- 50f7459: Dep upgrade, vitest in particular

## 1.16.0

### Minor Changes

- d49c764: Support static asset packages in execution pipelines

## 1.15.1

### Patch Changes

- 89eaf3e: Support \*.as.json asset files

## 1.15.0

### Minor Changes

- fb9ed15: Teach tengo builder to find assets and detect asset imports

## 1.14.13

### Patch Changes

- 05cd19b: Use oclif-index script to build index file with commands

## 1.14.12

### Patch Changes

- 7cd0fa6: regression: add missing commands after transfering to monorepo

## 1.14.11

### Patch Changes

- 902b21f: tengo builder moved to @platforma-sdk scope

## 1.14.10

### Patch Changes

- fcbc2df: fixes for proper bundling and require/import compatibility
- 41b10cd: another set of fixes for ESM / CJS compatibility

## 1.14.9

### Patch Changes

- c52a9a2: Warn instead of error if universal-ctags failed

## 1.14.8

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig

## 1.14.7

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
