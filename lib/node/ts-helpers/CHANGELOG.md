# @milaboratories/ts-helpers

## 1.5.1

### Patch Changes

- 25c0fed: PFrames driver - limit disk footprint

## 1.5.0

### Minor Changes

- 916de57: node version bump

## 1.4.7

### Patch Changes

- 3d9638e: PFramesDriver run HTTP parquet server

## 1.4.6

### Patch Changes

- 10a5439: Ref counting pool moved to ts-helpers

## 1.4.5

### Patch Changes

- b14b2fb: update dist builder

## 1.4.4

### Patch Changes

- 3f93434: Packages configuration normalization

## 1.4.3

### Patch Changes

- ff4a709: Improve atomic file creation with random suffixes

  - Enhanced `createPathAtomically()` to use random suffixes for temporary files
  - Prevents race conditions when multiple processes create files concurrently
  - Added proper cleanup of temporary files on errors
  - Uses crypto.randomBytes() for unique temporary file names

## 1.4.2

### Patch Changes

- 188ee1e: PFramesDriver - assume setDataInfo will become asynchronous

## 1.4.1

### Patch Changes

- 37800c5: Public tools packages

## 1.4.0

### Minor Changes

- c7894c2: - gzipped serialization and deserialization of jsons
  - cached string decoding

## 1.3.3

### Patch Changes

- 49cf7ee: Standard Error serialization/deserialization

## 1.3.2

### Patch Changes

- f191f2a: drivers: download: add sparse cache for ranges

## 1.3.1

### Patch Changes

- 0f511ff: Support for logging from the block model

## 1.3.0

### Minor Changes

- ce87da7: Allow to limit max delay between attempts for poller

## 1.2.0

### Minor Changes

- 01a558e: - cachedDeserialize
  - fixes for deepFreeze to avoid non-plain structures

## 1.1.7

### Patch Changes

- 5240867: Method to create an empty directory or empty the existing one

## 1.1.6

### Patch Changes

- 56d021e: added deepFreeze

## 1.1.5

### Patch Changes

- 9e9a70f: Configure eslint to all "node" packages

## 1.1.4

### Patch Changes

- a77b40a: add `any` everywhere, ssh: persistent connection; upload: dynamic part chooser

## 1.1.3

### Patch Changes

- dac7e27: retry(...) helper method

## 1.1.2

### Patch Changes

- 3dd3a5c: add test blocks

## 1.1.1

### Patch Changes

- 75b1646: Fixed bug in ConcurrencyLimitingExecutor

## 1.1.0

### Minor Changes

- 9e6e912: Concurrency limiting executor

## 1.0.30

### Patch Changes

- 7a04201: export of msToHumanReadable function

## 1.0.29

### Patch Changes

- 1e10161: new pl-local package that launches platforma

## 1.0.28

### Patch Changes

- e65f21d: withTimeout & sleep refactoring

## 1.0.27

### Patch Changes

- fa6d0f2: V2 Registry API

## 1.0.26

### Patch Changes

- fcbc2df: fixes for proper bundling and require/import compatibility

## 1.0.25

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig

## 1.0.24

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json

## 1.0.23

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
