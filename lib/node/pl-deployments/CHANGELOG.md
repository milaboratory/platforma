# @milaboratories/pl-local

## 2.3.2

### Patch Changes

- Updated dependencies [c7894c2]
  - @milaboratories/ts-helpers@1.4.0
  - @milaboratories/pl-config@1.4.14

## 2.3.1

### Patch Changes

- Updated dependencies [49cf7ee]
  - @milaboratories/ts-helpers@1.3.3
  - @milaboratories/pl-config@1.4.13

## 2.3.0

### Minor Changes

- f6e9a33: Release pl=1.33.8

## 2.2.5

### Patch Changes

- Updated dependencies [f191f2a]
  - @milaboratories/ts-helpers@1.3.2
  - @milaboratories/pl-config@1.4.12

## 2.2.4

### Patch Changes

- e1227f9: Update embedded pl core version to 1.33.5

## 2.2.3

### Patch Changes

- Updated dependencies [0f511ff]
  - @milaboratories/ts-helpers@1.3.1
  - @milaboratories/pl-config@1.4.11

## 2.2.2

### Patch Changes

- Updated dependencies [ce87da7]
  - @milaboratories/ts-helpers@1.3.0
  - @milaboratories/pl-config@1.4.10

## 2.2.1

### Patch Changes

- 89fd5d3: drivers: download: implement definitions in middle layer

## 2.2.0

### Minor Changes

- 541b174: Release pl=1.33.4

## 2.1.3

### Patch Changes

- 7dece07: use backend v1.33.1

## 2.1.2

### Patch Changes

- Updated dependencies [01a558e]
  - @milaboratories/ts-helpers@1.2.0
  - @milaboratories/pl-config@1.4.9

## 2.1.1

### Patch Changes

- Updated dependencies [5240867]
  - @milaboratories/ts-helpers@1.1.7
  - @milaboratories/pl-config@1.4.8

## 2.1.0

### Minor Changes

- 56c7b92: Release 1.31.4 with bugfix for transaction trees tracking logic

## 2.0.1

### Patch Changes

- Updated dependencies [56d021e]
  - @milaboratories/ts-helpers@1.1.6
  - @milaboratories/pl-config@1.4.7

## 2.0.0

### Major Changes

- 9ca5b8d: changeset bump; something is strang with version

### Minor Changes

- 9848afc: bump pl backend 2

## 1.8.2

### Patch Changes

- 3a4637b: bump pl backend: fix panic with cached templates in bootstrap

## 1.8.1

### Patch Changes

- 0840772: limit GOMAXPROCS everywhere
- Updated dependencies [0840772]
  - @milaboratories/pl-config@1.4.6

## 1.9.0

### Minor Changes

- 30b6803: Release pl=1.30.1

## 1.8.0

### Minor Changes

- e432092: Release pl=1.30.0 (gzip support)

## 1.7.2

### Patch Changes

- 611bb3d: bump pl backend

## 1.7.1

### Patch Changes

- 9e9a70f: Configure eslint to all "node" packages
- Updated dependencies [9e9a70f]
  - @milaboratories/ts-helpers@1.1.5
  - @milaboratories/pl-config@1.4.5

## 1.7.0

### Minor Changes

- 71b2935: Release pl=1.26.4

## 1.6.1

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
- Updated dependencies [a505bdb]
  - @milaboratories/pl-config@1.4.4
  - @milaboratories/ts-helpers@1.1.4

## 1.6.0

### Minor Changes

- ecf6caf: Release pl=1.26.2

## 1.5.0

### Minor Changes

- 638ab88: Pl upgrade to 1.26.0

## 1.4.1

### Patch Changes

- 553693d: Update pl to 1.25.2 to make it work in docker

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
