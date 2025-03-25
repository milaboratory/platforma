# @milaboratories/pl-drivers

## 1.5.29

### Patch Changes

- Updated dependencies [b084260]
  - @milaboratories/pl-model-common@1.11.1

## 1.5.28

### Patch Changes

- Updated dependencies [2a0fb91]
- Updated dependencies [d6a49b2]
  - @milaboratories/pl-tree@1.4.33
  - @milaboratories/computable@2.4.1

## 1.5.27

### Patch Changes

- Updated dependencies [1016b99]
  - @milaboratories/pl-model-common@1.11.0

## 1.5.26

### Patch Changes

- Updated dependencies [fdd58fd]
  - @milaboratories/computable@2.4.0
  - @milaboratories/pl-tree@1.4.32

## 1.5.25

### Patch Changes

- Updated dependencies [3944280]
  - @milaboratories/pl-client@2.7.12
  - @milaboratories/pl-tree@1.4.31

## 1.5.24

### Patch Changes

- @milaboratories/pl-client@2.7.11
- @milaboratories/pl-tree@1.4.30

## 1.5.23

### Patch Changes

- @milaboratories/pl-client@2.7.10
- @milaboratories/pl-tree@1.4.29

## 1.5.22

### Patch Changes

- Updated dependencies [2c75b72]
  - @milaboratories/pl-client@2.7.9
  - @milaboratories/pl-tree@1.4.28

## 1.5.21

### Patch Changes

- Updated dependencies [1628eec]
  - @milaboratories/pl-client@2.7.8
  - @milaboratories/pl-tree@1.4.27

## 1.5.20

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
  - @milaboratories/pl-tree@1.4.26

## 1.5.19

### Patch Changes

- Updated dependencies [d1f4acf]
  - @milaboratories/pl-client@2.7.6
  - @milaboratories/pl-tree@1.4.25

## 1.5.18

### Patch Changes

- 819c13c: getComputableContent method for DownloadDriver
- Updated dependencies [819c13c]
  - @milaboratories/pl-model-common@1.10.6

## 1.5.17

### Patch Changes

- a77b40a: add `any` everywhere, ssh: persistent connection; upload: dynamic part chooser
- Updated dependencies [a77b40a]
  - @milaboratories/ts-helpers@1.1.4
  - @milaboratories/computable@2.3.5
  - @milaboratories/pl-client@2.7.5
  - @milaboratories/pl-tree@1.4.24

## 1.5.16

### Patch Changes

- 19c273b: SDK Eslint config

## 1.5.15

### Patch Changes

- 6a50f96: keepalive, more logs

## 1.5.14

### Patch Changes

- @milaboratories/pl-client@2.7.4
- @milaboratories/pl-tree@1.4.23

## 1.5.13

### Patch Changes

- 388c9d2: add getProgressLogWithInfo to log driver
- Updated dependencies [388c9d2]
  - @milaboratories/pl-model-common@1.10.5

## 1.5.12

### Patch Changes

- 3c474bd: drivers: fix unzipping nested dirs in blob_to_url driver

## 1.5.11

### Patch Changes

- ce558f9: add blob to url driver that decompress the folder and returns url to the blob
- b41709a: new driver: blob to url that unarchive things
- Updated dependencies [ce558f9]
- Updated dependencies [b41709a]
  - @milaboratories/pl-model-common@1.10.4

## 1.5.10

### Patch Changes

- Updated dependencies [32c7f91]
  - @milaboratories/pl-client@2.7.3
  - @milaboratories/pl-tree@1.4.22

## 1.5.9

### Patch Changes

- Updated dependencies [a9b0749]
  - @milaboratories/pl-client@2.7.2
  - @milaboratories/pl-tree@1.4.21

## 1.5.8

### Patch Changes

- Updated dependencies [32966e6]
  - @milaboratories/pl-model-common@1.10.3

## 1.5.7

### Patch Changes

- ddb29cf: upload: done progress if a blob already existed

## 1.5.6

### Patch Changes

- Updated dependencies [079f50e]
  - @milaboratories/pl-model-common@1.10.2

## 1.5.5

### Patch Changes

- 95d7801: drivers: download: fix JSON.strinfigy in logs; don't call S3 just because of size; enable tests

## 1.5.4

### Patch Changes

- 8903a30: Dependency upgrade
- Updated dependencies [8903a30]
  - @milaboratories/pl-model-common@1.10.1
  - @milaboratories/pl-client@2.7.1
  - @milaboratories/pl-tree@1.4.20

## 1.5.3

### Patch Changes

- Updated dependencies [4d9885b]
  - @milaboratories/pl-model-common@1.10.0

## 1.5.2

### Patch Changes

- Updated dependencies [6efea3d]
  - @milaboratories/pl-model-common@1.9.0

## 1.5.1

### Patch Changes

- Updated dependencies [02feb1a]
  - @milaboratories/pl-model-common@1.8.1

## 1.5.0

### Minor Changes

- dac7e27: undici and grpc libraries upgrade

### Patch Changes

- Updated dependencies [81a1ad7]
- Updated dependencies [dac7e27]
- Updated dependencies [dac7e27]
  - @milaboratories/pl-client@2.7.0
  - @milaboratories/ts-helpers@1.1.3
  - @milaboratories/pl-tree@1.4.19
  - @milaboratories/computable@2.3.4

## 1.4.0

### Minor Changes

- f5b996c: huge refactoring, several bugs fixed, see https://www.notion.so/mixcr/drivers-Upload-stability-issue-multiple-issues-in-this-ticket-1423a83ff4af8099a6c1e3b46f2c269e?pvs=4

### Patch Changes

- 3dd3a5c: add test blocks
- Updated dependencies [3dd3a5c]
  - @milaboratories/ts-helpers@1.1.2
  - @milaboratories/computable@2.3.3
  - @milaboratories/pl-client@2.6.3
  - @milaboratories/pl-tree@1.4.18

## 1.3.26

### Patch Changes

- Updated dependencies [80d74a1]
  - @milaboratories/pl-client@2.6.2
  - @milaboratories/pl-tree@1.4.17

## 1.3.25

### Patch Changes

- Updated dependencies [dfad2d0]
  - @milaboratories/pl-model-common@1.8.0

## 1.3.24

### Patch Changes

- Updated dependencies [a5100ac]
  - @milaboratories/pl-model-common@1.7.0

## 1.3.23

### Patch Changes

- Updated dependencies [c1ea333]
  - @milaboratories/computable@2.3.2
  - @milaboratories/pl-tree@1.4.16

## 1.3.22

### Patch Changes

- Updated dependencies [e0f0eed]
  - @milaboratories/pl-model-common@1.6.4

## 1.3.21

### Patch Changes

- Updated dependencies [6f56890]
  - @milaboratories/pl-model-common@1.6.3

## 1.3.20

### Patch Changes

- Updated dependencies [b207f86]
  - @milaboratories/pl-client@2.6.1
  - @milaboratories/pl-tree@1.4.15

## 1.3.19

### Patch Changes

- Updated dependencies [5113fe4]
- Updated dependencies [5113fe4]
  - @milaboratories/pl-client@2.6.0
  - @milaboratories/pl-tree@1.4.14

## 1.3.18

### Patch Changes

- Updated dependencies [e70d0db]
  - @milaboratories/computable@2.3.1
  - @milaboratories/pl-tree@1.4.13

## 1.3.17

### Patch Changes

- b04a78a: Minor stability marker fixes, upload stability problem isolated.
- Updated dependencies [b04a78a]
- Updated dependencies [b04a78a]
  - @milaboratories/computable@2.3.0
  - @milaboratories/pl-model-common@1.6.2
  - @milaboratories/pl-tree@1.4.12

## 1.3.16

### Patch Changes

- 0382abe: Undici & AWS SDK upgrades.
- Updated dependencies [0382abe]
  - @milaboratories/pl-client@2.5.10
  - @milaboratories/pl-tree@1.4.11

## 1.3.15

### Patch Changes

- Updated dependencies [a5af4f2]
  - @milaboratories/pl-model-common@1.6.1

## 1.3.14

### Patch Changes

- Updated dependencies [05751fa]
  - @milaboratories/pl-model-common@1.6.0

## 1.3.13

### Patch Changes

- Updated dependencies [83b50e0]
  - @milaboratories/pl-client@2.5.9
  - @milaboratories/pl-tree@1.4.10

## 1.3.12

### Patch Changes

- 5a4d01b: drivers, upload: return an immutable object to API, bump pl with fixing getStatus error

## 1.3.11

### Patch Changes

- Updated dependencies [0573960]
  - @milaboratories/pl-client@2.5.8
  - @milaboratories/pl-tree@1.4.9

## 1.3.10

### Patch Changes

- Updated dependencies [75b1646]
  - @milaboratories/ts-helpers@1.1.1
  - @milaboratories/computable@2.2.1
  - @milaboratories/pl-client@2.5.7
  - @milaboratories/pl-tree@1.4.8

## 1.3.9

### Patch Changes

- Updated dependencies [50f7459]
  - @milaboratories/pl-client@2.5.6
  - @milaboratories/pl-tree@1.4.7

## 1.3.8

### Patch Changes

- 58fa87c: fix no progress in mixcr clonotyping logs

## 1.3.7

### Patch Changes

- Updated dependencies [612a9be]
  - @milaboratories/pl-model-common@1.5.2

## 1.3.6

### Patch Changes

- 8e0ef1f: ls: if wmic is not found, fall back to just drive C
- Updated dependencies [8e9424a]
  - @milaboratories/pl-model-common@1.5.1

## 1.3.5

### Patch Changes

- Updated dependencies [1d5f1e2]
- Updated dependencies [1d5f1e2]
  - @milaboratories/pl-client@2.5.5
  - @milaboratories/pl-tree@1.4.6

## 1.3.4

### Patch Changes

- 9dae9aa: migration to new LS SDK model
- Updated dependencies [9dae9aa]
  - @milaboratories/pl-model-common@1.5.0

## 1.3.3

### Patch Changes

- 4598cac: drivers: ls: more storages for Windows

## 1.3.2

### Patch Changes

- Updated dependencies [28429fa]
  - @milaboratories/pl-client@2.5.4
  - @milaboratories/pl-tree@1.4.5

## 1.3.1

### Patch Changes

- 1e57f5b: decode urls for downloading (it was broken on Windows)

## 1.3.0

### Minor Changes

- 352e182: refactoring of ls controller and driver options

### Patch Changes

- Updated dependencies [66383b6]
- Updated dependencies [66383b6]
- Updated dependencies [66383b6]
  - @milaboratories/computable@2.2.0
  - @milaboratories/pl-client@2.5.3
  - @milaboratories/pl-model-common@1.4.0
  - @milaboratories/pl-tree@1.4.4

## 1.2.35

### Patch Changes

- Updated dependencies [eb079e9]
  - @milaboratories/pl-model-common@1.3.15

## 1.2.34

### Patch Changes

- Updated dependencies [11d30ad]
  - @milaboratories/pl-client@2.5.2
  - @milaboratories/pl-tree@1.4.3

## 1.2.33

### Patch Changes

- Updated dependencies [9e6e912]
  - @milaboratories/ts-helpers@1.1.0
  - @milaboratories/computable@2.1.13
  - @milaboratories/pl-client@2.5.1
  - @milaboratories/pl-tree@1.4.2

## 1.2.32

### Patch Changes

- Updated dependencies [dd26f39]
  - @milaboratories/pl-client@2.5.0
  - @milaboratories/pl-tree@1.4.1

## 1.2.31

### Patch Changes

- Updated dependencies [a5562e9]
- Updated dependencies [a5562e9]
  - @milaboratories/pl-tree@1.4.0
  - @milaboratories/pl-client@2.4.21

## 1.2.30

### Patch Changes

- Updated dependencies [13013ee]
- Updated dependencies [36736de]
  - @milaboratories/pl-model-common@1.3.14
  - @milaboratories/pl-client@2.4.20
  - @milaboratories/pl-tree@1.3.19

## 1.2.29

### Patch Changes

- Updated dependencies [7a04201]
- Updated dependencies [89cf026]
- Updated dependencies [7a04201]
  - @milaboratories/ts-helpers@1.0.30
  - @milaboratories/computable@2.1.12
  - @milaboratories/pl-tree@1.3.18
  - @milaboratories/pl-client@2.4.19

## 1.2.28

### Patch Changes

- 1e10161: new pl-local package that launches platforma
- Updated dependencies [1e10161]
- Updated dependencies [d5ef69e]
  - @milaboratories/ts-helpers@1.0.29
  - @milaboratories/computable@2.1.11
  - @milaboratories/pl-client@2.4.18
  - @milaboratories/pl-tree@1.3.17

## 1.2.27

### Patch Changes

- Updated dependencies [bfd40b4]
  - @milaboratories/computable@2.1.10
  - @milaboratories/pl-tree@1.3.16

## 1.2.26

### Patch Changes

- Updated dependencies [86c8d0f]
  - @milaboratories/computable@2.1.9
  - @milaboratories/pl-tree@1.3.15

## 1.2.25

### Patch Changes

- Updated dependencies [e65f21d]
- Updated dependencies [e65f21d]
  - @milaboratories/ts-helpers@1.0.28
  - @milaboratories/computable@2.1.8
  - @milaboratories/pl-client@2.4.17
  - @milaboratories/pl-tree@1.3.14

## 1.2.24

### Patch Changes

- 4bb85dc: read bodies in case of errors, body.destroy is too scary

## 1.2.23

### Patch Changes

- 60dc4db: undici: close all bodies, because they can hold resources
- 864a686: clear lastError from API when the loading is done
- Updated dependencies [1d1ff16]
  - @milaboratories/pl-client@2.4.16
  - @milaboratories/pl-tree@1.3.13

## 1.2.22

### Patch Changes

- Updated dependencies [fa6d0f2]
  - @milaboratories/ts-helpers@1.0.27
  - @milaboratories/pl-tree@1.3.12
  - @milaboratories/computable@2.1.7
  - @milaboratories/pl-client@2.4.15

## 1.2.21

### Patch Changes

- Updated dependencies [fcbc2df]
  - @milaboratories/ts-helpers@1.0.26
  - @milaboratories/pl-tree@1.3.11
  - @milaboratories/computable@2.1.6
  - @milaboratories/pl-client@2.4.14

## 1.2.20

### Patch Changes

- Updated dependencies [6d4cf3e]
  - @milaboratories/pl-model-common@1.3.13

## 1.2.19

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig
- Updated dependencies [da1e029]
  - @milaboratories/pl-model-common@1.3.12
  - @milaboratories/computable@2.1.5
  - @milaboratories/pl-client@2.4.13
  - @milaboratories/pl-tree@1.3.10
  - @milaboratories/ts-helpers@1.0.25

## 1.2.18

### Patch Changes

- Updated dependencies [1a71473]
  - @milaboratories/pl-tree@1.3.9

## 1.2.17

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json
- Updated dependencies [0f3f25f]
  - @milaboratories/computable@2.1.4
  - @milaboratories/ts-helpers@1.0.24
  - @milaboratories/pl-client@2.4.12
  - @milaboratories/pl-model-common@1.3.11
  - @milaboratories/pl-tree@1.3.8

## 1.2.16

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
- Updated dependencies [244e3dc]
  - @milaboratories/computable@2.1.3
  - @milaboratories/ts-helpers@1.0.23
  - @milaboratories/pl-client@2.4.11
  - @milaboratories/pl-model-common@1.3.10
  - @milaboratories/pl-tree@1.3.7
