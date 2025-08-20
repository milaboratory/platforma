# @milaboratories/pl-model-backend

## 1.1.5

### Patch Changes

- @milaboratories/pl-client@2.11.12

## 1.1.4

### Patch Changes

- b14b2fb: update dist builder
- Updated dependencies [b14b2fb]
  - @milaboratories/pl-client@2.11.10

## 1.1.3

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/pl-client@2.11.9

## 1.1.2

### Patch Changes

- d60b0fe: Chore: fix linter errors

## 1.1.1

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/pl-client@2.11.2

## 1.1.0

### Minor Changes

- 6506dec: templates: support v3 version where we store source code in a hash map rather than in every leaf of the template tree. It will help a lot with build times and loading times of "Add Block" button

## 1.0.4

### Patch Changes

- 2e8b782: Use non-blocking gunzip to extract template content

## 1.0.3

### Patch Changes

- 4812a12: apply eslint rules to the all "model" packages

## 1.0.2

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
  - @milaboratories/pl-client@2.7.7

## 1.0.1

### Patch Changes

- 87790da: Middle layer now renders template tree on its own instead of uploading template pack to the server
