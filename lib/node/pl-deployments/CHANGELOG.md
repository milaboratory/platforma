# @milaboratories/pl-local

## 1.4.0

### Minor Changes

- ca12fd4: Release pl=1.25.1

## 1.3.0

### Minor Changes

- f3438f1: Release pl=1.25.0 with default log rotation rules

## 1.2.4

### Patch Changes

- ed96fa8: added messages for desktop

## 1.2.3

### Patch Changes

- 4726310: check tar; check glibc

## 1.2.2

### Patch Changes

- 0839de6: bump pl version, OutputsLocked event in tengo

## 1.2.1

### Patch Changes

- 5b3f215: ssh: remove tcp delay, greatly improved performance

## 1.2.0

### Minor Changes

- 39c113b: Release pl=1.23.0

## 1.1.16

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
  - @milaboratories/pl-config@1.4.3

## 1.1.15

### Patch Changes

- e9a6ef1: tengo: exec: mnz: add dry-run and n remaining runs

## 1.1.14

### Patch Changes

- 2a749e0: restart ssh if pl backend version changed

## 1.1.13

### Patch Changes

- f67f1b2: bump ssh, local and bootstrap pl backend

## 1.1.12

### Patch Changes

- 1b37b62: pl-deployments: fix ssh exports

## 1.1.11

### Patch Changes

- 467a150: ssh: option for global access
- Updated dependencies [467a150]
  - @milaboratories/pl-config@1.4.2

## 1.1.10

### Patch Changes

- 7b6b2bd: fix test

## 1.1.9

### Patch Changes

- 12600dd: ssh: fix license passing

## 1.1.8

### Patch Changes

- e66f726: ssh: pass license explicitly

## 1.1.7

### Patch Changes

- b069ecd: pl-deployments: download binaries from GA if CDN has failed

## 1.1.6

### Patch Changes

- 33ea5a0: review fix

## 1.1.5

### Patch Changes

- a77b40a: add `any` everywhere, ssh: persistent connection; upload: dynamic part chooser
- Updated dependencies [a77b40a]
  - @milaboratories/ts-helpers@1.1.4
  - @milaboratories/pl-config@1.4.1

## 1.1.4

### Patch Changes

- 0b92139: added delete folder function

## 1.1.3

### Patch Changes

- 9cf0459: increase timeouts

## 1.1.2

### Patch Changes

- 6a50f96: keepalive, more logs

## 1.1.1

### Patch Changes

- 388c9d2: add getProgressLogWithInfo to log driver

## 1.1.0

### Minor Changes

- dc94ca3: pl-deployments: add ssh support

### Patch Changes

- Updated dependencies [dc94ca3]
  - @milaboratories/pl-config@1.4.0

## 1.10.0

### Minor Changes

- 95bdff7: Use pl=1.18.0 as default version in Desktop app and pl-bootstrap

## 1.9.1

### Patch Changes

- Updated dependencies [dac7e27]
  - @milaboratories/ts-helpers@1.1.3

## 1.9.0

### Minor Changes

- 606f494: Use Platforma Backend 1.17.0 in desktop local mode

## 1.8.2

### Patch Changes

- 7eb5aa3: bump pl: escape path for download url

## 1.8.1

### Patch Changes

- Updated dependencies [3dd3a5c]
  - @milaboratories/ts-helpers@1.1.2

## 1.8.0

### Minor Changes

- 3a6f0d4: Release pl=1.15.8

## 1.7.1

### Patch Changes

- 9470bfb: hide a terminal window on Windows

## 1.7.0

### Minor Changes

- 49d3fc5: Use pl=1.15.5 as default backend version

## 1.6.1

### Patch Changes

- 327d3bd: bump platforma: contextresolver add Domain query

## 1.6.0

### Minor Changes

- 82ae8b6: Use 1.14.15 as pl default version

## 1.5.2

### Patch Changes

- 5a4d01b: drivers, upload: return an immutable object to API, bump pl with fixing getStatus error

## 1.5.1

### Patch Changes

- Updated dependencies [75b1646]
  - @milaboratories/ts-helpers@1.1.1

## 1.5.0

### Minor Changes

- e4eb816: Release pl=1.14.13

## 1.4.3

### Patch Changes

- 9dae9aa: pl upgrade to 1.14.12

## 1.4.2

### Patch Changes

- a1f7909: fix launching pl-local on Windows

## 1.4.1

### Patch Changes

- 97e2682: windows fix

## 1.4.0

### Minor Changes

- d9f6d13: Major refactoring
  Information about default pl version moved to pl-local

## 1.3.0

### Minor Changes

- 073c259: readability improvement & better robustness for mid-way pl downaload and unpack interruption

## 1.2.6

### Patch Changes

- Updated dependencies [9e6e912]
  - @milaboratories/ts-helpers@1.1.0

## 1.2.5

### Patch Changes

- 33e8fbc: remove .test dir that was created after tests from build

## 1.2.4

### Patch Changes

- c7dc613: add stopped property

## 1.2.3

### Patch Changes

- d6edf35: add do-pack
  - @milaboratories/ts-helpers@1.0.30

## 1.2.2

### Patch Changes

- 8dae1d6: remote restart-hooks, add onClose, onError etc

## 1.2.1

### Patch Changes

- pl-config: remove ml dep, add more auths

## 1.2.0

### Minor Changes

- e546f86: integration test for pl-config, pl-local and ml

### Patch Changes

- Updated dependencies [7a04201]
  - @milaboratories/ts-helpers@1.0.30

## 1.1.1

### Patch Changes

- 5f57a27: pl-config initial

## 1.1.0

### Minor Changes

- 1e10161: new pl-local package that launches platforma

### Patch Changes

- Updated dependencies [1e10161]
  - @milaboratories/ts-helpers@1.0.29
