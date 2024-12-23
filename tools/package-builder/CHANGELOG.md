# @platforma-sdk/package-builder

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
