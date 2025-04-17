# @platforma-sdk/bootstrap

## 3.4.6

### Patch Changes

- 3a4637b: bump pl backend: fix panic with cached templates in bootstrap
- Updated dependencies [3a4637b]
  - @milaboratories/pl-deployments@1.8.2

## 3.4.5

### Patch Changes

- 0840772: limit GOMAXPROCS everywhere
- Updated dependencies [0840772]
  - @milaboratories/pl-deployments@1.8.1

## 3.4.4

### Patch Changes

- Updated dependencies [30b6803]
  - @milaboratories/pl-deployments@1.9.0

## 3.4.3

### Patch Changes

- Updated dependencies [e432092]
  - @milaboratories/pl-deployments@1.8.0

## 3.4.2

### Patch Changes

- dc1a3ea: Disable compute limits feature in backend

## 3.4.1

### Patch Changes

- Updated dependencies [611bb3d]
  - @milaboratories/pl-deployments@1.7.2

## 3.4.0

### Minor Changes

- 4248345: Keep success WDs for 20 minutes after execution in docker

## 3.3.1

### Patch Changes

- 3f128a7: Block stdin when starting backend with 'start local' command. Do not duplicate startup report

## 3.3.0

### Minor Changes

- 4d9f520: Preserve all working directories for an hour. No only failures

## 3.2.13

### Patch Changes

- aff6744: Fixes boilerplate failure to run block with no python software due to missing model output used in UI

## 3.2.12

### Patch Changes

- Updated dependencies [9e9a70f]
  - @milaboratories/pl-deployments@1.7.1

## 3.2.11

### Patch Changes

- Updated dependencies [71b2935]
  - @milaboratories/pl-deployments@1.7.0

## 3.2.10

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
  - @milaboratories/pl-deployments@1.6.1

## 3.2.9

### Patch Changes

- Updated dependencies [ecf6caf]
  - @milaboratories/pl-deployments@1.6.0

## 3.2.8

### Patch Changes

- Updated dependencies [638ab88]
  - @milaboratories/pl-deployments@1.5.0

## 3.2.7

### Patch Changes

- Updated dependencies [553693d]
  - @milaboratories/pl-deployments@1.4.1

## 3.2.6

### Patch Changes

- Updated dependencies [ca12fd4]
  - @milaboratories/pl-deployments@1.4.0

## 3.2.5

### Patch Changes

- Updated dependencies [f3438f1]
  - @milaboratories/pl-deployments@1.3.0

## 3.2.4

### Patch Changes

- Updated dependencies [ed96fa8]
  - @milaboratories/pl-deployments@1.2.4

## 3.2.3

### Patch Changes

- Updated dependencies [4726310]
  - @milaboratories/pl-deployments@1.2.3

## 3.2.2

### Patch Changes

- Updated dependencies [0839de6]
  - @milaboratories/pl-deployments@1.2.2

## 3.2.1

### Patch Changes

- Updated dependencies [5b3f215]
  - @milaboratories/pl-deployments@1.2.1

## 3.2.0

### Minor Changes

- 39c113b: Release pl=1.23.0

### Patch Changes

- Updated dependencies [39c113b]
  - @milaboratories/pl-deployments@1.2.0

## 3.1.24

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
  - @milaboratories/pl-deployments@1.1.16

## 3.1.23

### Patch Changes

- Updated dependencies [e9a6ef1]
  - @milaboratories/pl-deployments@1.1.15

## 3.1.22

### Patch Changes

- Updated dependencies [2a749e0]
  - @milaboratories/pl-deployments@1.1.14

## 3.1.21

### Patch Changes

- Updated dependencies [f67f1b2]
  - @milaboratories/pl-deployments@1.1.13

## 3.1.20

### Patch Changes

- 3d742d7: Don't print env variables into log when starting service instance with pl-dev

## 3.1.19

### Patch Changes

- Updated dependencies [1b37b62]
  - @milaboratories/pl-deployments@1.1.12

## 3.1.18

### Patch Changes

- Updated dependencies [467a150]
  - @milaboratories/pl-deployments@1.1.11

## 3.1.17

### Patch Changes

- Updated dependencies [7b6b2bd]
  - @milaboratories/pl-deployments@1.1.10

## 3.1.16

### Patch Changes

- Updated dependencies [12600dd]
  - @milaboratories/pl-deployments@1.1.9

## 3.1.15

### Patch Changes

- Updated dependencies [e66f726]
  - @milaboratories/pl-deployments@1.1.8

## 3.1.14

### Patch Changes

- Updated dependencies [b069ecd]
  - @milaboratories/pl-deployments@1.1.7

## 3.1.13

### Patch Changes

- Updated dependencies [33ea5a0]
  - @milaboratories/pl-deployments@1.1.6

## 3.1.12

### Patch Changes

- a77b40a: add `any` everywhere, ssh: persistent connection; upload: dynamic part chooser
- Updated dependencies [a77b40a]
  - @milaboratories/pl-deployments@1.1.5

## 3.1.11

### Patch Changes

- Updated dependencies [0b92139]
  - @milaboratories/pl-deployments@1.1.4

## 3.1.10

### Patch Changes

- bdaeac1: Re-compile platforma binary before each service start when instance is bound to sources

## 3.1.9

### Patch Changes

- 3a84d15: Fix notice message text after svc creation

## 3.1.8

### Patch Changes

- e753752: create-block: more error handling of user input

## 3.1.7

### Patch Changes

- 5046641: create-block: human-readable errors

## 3.1.6

### Patch Changes

- 0f33002: Cache working directories for faulty commands in docker
- Updated dependencies [9cf0459]
  - @milaboratories/pl-deployments@1.1.3

## 3.1.5

### Patch Changes

- e6444cf: Fix custom S3 storage settings generation from URL

## 3.1.4

### Patch Changes

- 37ea8d3: Make pl-bootstrap blocking back again for local services

## 3.1.3

### Patch Changes

- Updated dependencies [6a50f96]
  - @milaboratories/pl-deployments@1.1.2

## 3.1.2

### Patch Changes

- Updated dependencies [388c9d2]
  - @milaboratories/pl-deployments@1.1.1

## 3.1.1

### Patch Changes

- e70aca2: Do not limit possible architecture values for pl docker container

## 3.1.0

### Minor Changes

- dc94ca3: pl-deployments: add ssh support

### Patch Changes

- Updated dependencies [dc94ca3]
  - @milaboratories/pl-deployments@1.1.0

## 3.0.1

### Patch Changes

- 35148cd: Add README, fix small issues in help messages

## 3.0.0

### Major Changes

- 2e2d310: Introduce 'services' control in pl-bootsrap
  Rename pl-service to pl-dev

## 2.9.1

### Patch Changes

- 94ef070: Use 'minio' in presign URL in docker s3 instance

## 2.9.0

### Minor Changes

- b09ddc7: Add control over target container architecture and bind mounts

## 2.8.5

### Patch Changes

- Updated dependencies [95bdff7]
  - @milaboratories/pl-local@1.10.0

## 2.8.4

### Patch Changes

- @milaboratories/pl-local@1.9.1

## 2.8.3

### Patch Changes

- Updated dependencies [606f494]
  - @milaboratories/pl-local@1.9.0

## 2.8.2

### Patch Changes

- Updated dependencies [7eb5aa3]
  - @milaboratories/pl-local@1.8.2

## 2.8.1

### Patch Changes

- @milaboratories/pl-local@1.8.1

## 2.8.0

### Minor Changes

- a5100ac: PFrames case insensitive filters

## 2.7.2

### Patch Changes

- Updated dependencies [3a6f0d4]
  - @milaboratories/pl-local@1.8.0

## 2.7.1

### Patch Changes

- Updated dependencies [9470bfb]
  - @milaboratories/pl-local@1.7.1

## 2.7.0

### Minor Changes

- 49d3fc5: Enable log rotation in docker instance started with bootstrap

### Patch Changes

- Updated dependencies [49d3fc5]
  - @milaboratories/pl-local@1.7.0

## 2.6.3

### Patch Changes

- 73cc2d7: Keep the size of pl backend logs under control

## 2.6.2

### Patch Changes

- Updated dependencies [327d3bd]
  - @milaboratories/pl-local@1.6.1

## 2.6.1

### Patch Changes

- Updated dependencies [82ae8b6]
  - @milaboratories/pl-local@1.6.0

## 2.6.0

### Minor Changes

- 509b34d: add software platforms

## 2.5.10

### Patch Changes

- Updated dependencies [5a4d01b]
  - @milaboratories/pl-local@1.5.2

## 2.5.9

### Patch Changes

- @milaboratories/pl-local@1.5.1

## 2.5.8

### Patch Changes

- 50f7459: Dep upgrade, vitest in particular

## 2.5.7

### Patch Changes

- Updated dependencies [e4eb816]
  - @milaboratories/pl-local@1.5.0

## 2.5.6

### Patch Changes

- Updated dependencies [9dae9aa]
  - @milaboratories/pl-local@1.4.3

## 2.5.5

### Patch Changes

- Updated dependencies [a1f7909]
  - @milaboratories/pl-local@1.4.2

## 2.5.4

### Patch Changes

- Updated dependencies [97e2682]
  - @milaboratories/pl-local@1.4.1

## 2.5.3

### Patch Changes

- Updated dependencies [d9f6d13]
  - @milaboratories/pl-local@1.4.0

## 2.5.2

### Patch Changes

- d5872af: Load default list of users for backend in docker with auth enabled

## 2.5.1

### Patch Changes

- Updated dependencies [073c259]
  - @milaboratories/pl-local@1.3.0

## 2.5.0

### Minor Changes

- 0899a98: Relese pl=1.14.7 to UI and bootstrap

### Patch Changes

- Updated dependencies [0899a98]
  - @milaboratories/pl-config@1.2.7
  - @milaboratories/pl-local@1.2.6

## 2.4.4

### Patch Changes

- Updated dependencies [33e8fbc]
  - @milaboratories/pl-local@1.2.5

## 2.4.3

### Patch Changes

- Updated dependencies [7207876]
  - @milaboratories/pl-config@1.2.6

## 2.4.2

### Patch Changes

- Updated dependencies [2716eb1]
  - @milaboratories/pl-config@1.2.5

## 2.4.1

### Patch Changes

- dddf97f: bump pl version, change pl-bootstrap to get pl-version from pl-config
- Updated dependencies [c7dc613]
- Updated dependencies [dddf97f]
  - @milaboratories/pl-local@1.2.4
  - @milaboratories/pl-config@1.2.4

## 2.4.0

### Minor Changes

- b4261a7: Release pl 1.14.0 to bootstrap

## 2.2.0

### Minor Changes

- 7cb960f: Release pl 1.13.5

## 2.1.2

### Patch Changes

- ad7680f: fix boilerplate-code, replace all occurrences

## 2.1.1

### Patch Changes

- c107f11: Allow docker to write dirs in user home

## 2.1.0

### Minor Changes

- 31d2654: Use pl 1.13.4 as default version
- 1564695: Use pl 1.13.3 as default version

## 2.0.2

### Patch Changes

- 05cd19b: Use oclif-index script to build index file with commands

## 2.0.1

### Patch Changes

- 7cd0fa6: regression: add missing commands after transfering to monorepo

## 2.0.0

### Major Changes

- ca19316: move to monorepo
