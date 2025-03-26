# @platforma-sdk/r-builder

## 1.1.8

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

## 1.1.7

### Patch Changes

- 2dee61b: Monetization Component Demo

## 1.1.6

### Patch Changes

- 5bc719a: Exclude more system libraries from R bundle

## 1.1.5

### Patch Changes

- 1a8b661: Ignore all known glibc libraries when bundling R

## 1.1.4

### Patch Changes

- 33239c5: Don't get parts of libc into R distribution. Use system one

## 1.1.3

### Patch Changes

- f5b7967: Dump full list of packages installed into renv in snapshot

## 1.1.2

### Patch Changes

- b791b1e: Don't copy libraries twice to avoid issues with permissions (no 'w' for current user)

## 1.1.1

### Patch Changes

- 23c98e3: Fix postinstall steps

## 1.1.0

### Minor Changes

- f78c9a9: Support rocky linux

## 1.0.0

### Major Changes

- 70a8665: Initial release

## 0.0.5

### Patch Changes

- ef027e2: Fix download logic for CI (when out is not TTY)

## 0.0.4

### Patch Changes

- a8ec363: Drop unused xz import

## 0.0.3

### Patch Changes

- c3060c8: Polishing

## 0.0.2

### Patch Changes

- 95e58fa: Lost assets

## 0.0.1

### Patch Changes

- 970b32b: Experiment with separate R builder script
