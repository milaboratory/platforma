# @milaboratories/computable

## 2.8.2

### Patch Changes

- Updated dependencies [a267fe8]
  - @milaboratories/ts-helpers@1.7.0

## 2.8.1

### Patch Changes

- Updated dependencies [1694d1a]
  - @milaboratories/ts-helpers@1.6.0

## 2.8.0

### Minor Changes

- fc75a16: Added `stable` flag in `Computable.wrapError`

## 2.7.5

### Patch Changes

- bf86c9c: Fix race condition where HierarchicalWatcher could be garbage collected before awaitChange() promise resolved, causing tests to timeout. Added global registry to pin watchers with pending promises.

## 2.7.4

### Patch Changes

- Updated dependencies [8996bed]
  - @milaboratories/ts-helpers@1.5.4

## 2.7.3

### Patch Changes

- Updated dependencies [6af87a6]
  - @milaboratories/ts-helpers@1.5.3

## 2.7.2

### Patch Changes

- Updated dependencies [55b218b]
  - @milaboratories/ts-helpers@1.5.2

## 2.7.1

### Patch Changes

- Updated dependencies [25c0fed]
  - @milaboratories/ts-helpers@1.5.1

## 2.7.0

### Minor Changes

- 916de57: node version bump

### Patch Changes

- Updated dependencies [916de57]
  - @milaboratories/ts-helpers@1.5.0

## 2.6.8

### Patch Changes

- 3d9638e: PFramesDriver run HTTP parquet server
- Updated dependencies [3d9638e]
  - @milaboratories/ts-helpers@1.4.7

## 2.6.7

### Patch Changes

- Updated dependencies [0ff2a1b]
  - @milaboratories/pl-error-like@1.12.5

## 2.6.6

### Patch Changes

- Updated dependencies [10a5439]
  - @milaboratories/ts-helpers@1.4.6

## 2.6.5

### Patch Changes

- b14b2fb: update dist builder
- Updated dependencies [b14b2fb]
  - @milaboratories/pl-error-like@1.12.4
  - @milaboratories/ts-helpers@1.4.5

## 2.6.4

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/pl-error-like@1.12.3
  - @milaboratories/ts-helpers@1.4.4

## 2.6.3

### Patch Changes

- Updated dependencies [ff4a709]
  - @milaboratories/ts-helpers@1.4.3

## 2.6.2

### Patch Changes

- Updated dependencies [188ee1e]
  - @milaboratories/ts-helpers@1.4.2

## 2.6.1

### Patch Changes

- 07b833e: Return value from get method

## 2.6.0

### Minor Changes

- 3b46d33: - Change source marker
  - Keyed change source for more granular change tracking

## 2.5.1

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/pl-error-like@1.12.2
  - @milaboratories/ts-helpers@1.4.1

## 2.5.0

### Minor Changes

- babb3eb: - State refresh request now interrups delay in polling loop

### Patch Changes

- Updated dependencies [c7894c2]
  - @milaboratories/ts-helpers@1.4.0

## 2.4.12

### Patch Changes

- 49cf7ee: Standard Error serialization/deserialization
- Updated dependencies [49cf7ee]
  - @milaboratories/ts-helpers@1.3.3

## 2.4.11

### Patch Changes

- Updated dependencies [f191f2a]
  - @milaboratories/ts-helpers@1.3.2

## 2.4.10

### Patch Changes

- 73b9f26: Migrate from jest to vitest

## 2.4.9

### Patch Changes

- Updated dependencies [0f511ff]
  - @milaboratories/ts-helpers@1.3.1

## 2.4.8

### Patch Changes

- Updated dependencies [ce87da7]
  - @milaboratories/ts-helpers@1.3.0

## 2.4.7

### Patch Changes

- Updated dependencies [01a558e]
  - @milaboratories/ts-helpers@1.2.0

## 2.4.6

### Patch Changes

- Updated dependencies [5240867]
  - @milaboratories/ts-helpers@1.1.7

## 2.4.5

### Patch Changes

- Updated dependencies [141aebc]
  - @milaboratories/pl-error-like@1.12.1

## 2.4.4

### Patch Changes

- Updated dependencies [56d021e]
  - @milaboratories/ts-helpers@1.1.6

## 2.4.3

### Patch Changes

- 6e3329e: extract parsed_errors from pl-tree for future using it in computable
- Updated dependencies [ff0f92c]
  - @milaboratories/pl-error-like@1.12.0

## 2.4.2

### Patch Changes

- 9e9a70f: Configure eslint to all "node" packages
- Updated dependencies [9e9a70f]
  - @milaboratories/ts-helpers@1.1.5

## 2.4.1

### Patch Changes

- d6a49b2: extract parsed_errors from pl-tree for future using it in computable

## 2.4.0

### Minor Changes

- fdd58fd: Add a "wrap" method to Computable that creates a new Computable with post-processing(optional) and recovery actions

## 2.3.5

### Patch Changes

- Updated dependencies [a77b40a]
  - @milaboratories/ts-helpers@1.1.4

## 2.3.4

### Patch Changes

- Updated dependencies [dac7e27]
  - @milaboratories/ts-helpers@1.1.3

## 2.3.3

### Patch Changes

- Updated dependencies [3dd3a5c]
  - @milaboratories/ts-helpers@1.1.2

## 2.3.2

### Patch Changes

- c1ea333: Minor fixes to PollPool

## 2.3.1

### Patch Changes

- e70d0db: Fix for wrapped error computable, now key is inherited from input value

## 2.3.0

### Minor Changes

- b04a78a: Unstable marker is now required, when marking context unstable. UnstableMarker is accessible in postprocessing via second info argument of the lambda.

## 2.2.1

### Patch Changes

- Updated dependencies [75b1646]
  - @milaboratories/ts-helpers@1.1.1

## 2.2.0

### Minor Changes

- 66383b6: Allow numerically set timeout in addition to abort signal in await stable state methods

## 2.1.13

### Patch Changes

- Updated dependencies [9e6e912]
  - @milaboratories/ts-helpers@1.1.0

## 2.1.12

### Patch Changes

- 89cf026: fix unstable marker reset in computed value recalcualtion
- Updated dependencies [7a04201]
  - @milaboratories/ts-helpers@1.0.30

## 2.1.11

### Patch Changes

- d5ef69e: fixes GC-induced polling termination in PollComputablePool
- Updated dependencies [1e10161]
  - @milaboratories/ts-helpers@1.0.29

## 2.1.10

### Patch Changes

- bfd40b4: Additional logging and fixes for block watcher & poll pool

## 2.1.9

### Patch Changes

- 86c8d0f: logging of poll pool termination & and notification of poll actors

## 2.1.8

### Patch Changes

- e65f21d: postprocessing timeout
- Updated dependencies [e65f21d]
  - @milaboratories/ts-helpers@1.0.28

## 2.1.7

### Patch Changes

- Updated dependencies [fa6d0f2]
  - @milaboratories/ts-helpers@1.0.27

## 2.1.6

### Patch Changes

- Updated dependencies [fcbc2df]
  - @milaboratories/ts-helpers@1.0.26

## 2.1.5

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig
- Updated dependencies [da1e029]
  - @milaboratories/ts-helpers@1.0.25

## 2.1.4

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json
- Updated dependencies [0f3f25f]
  - @milaboratories/ts-helpers@1.0.24

## 2.1.3

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
- Updated dependencies [244e3dc]
  - @milaboratories/ts-helpers@1.0.23
