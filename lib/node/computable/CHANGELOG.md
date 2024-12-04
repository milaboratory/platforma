# @milaboratories/computable

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
