# @milaboratories/pl-client

## 2.7.12

### Patch Changes

- 3944280: - gRPC transport library upgrade
  - gRPC code updated and regenerated

## 2.7.11

### Patch Changes

- Updated dependencies [3bf8838]
  - @milaboratories/pl-http@1.1.0

## 2.7.10

### Patch Changes

- Updated dependencies [e6ad278]
  - @milaboratories/pl-http@1.0.7

## 2.7.9

### Patch Changes

- 2c75b72: RNull type constant

## 2.7.8

### Patch Changes

- 1628eec: increase tx timeout: it'll fix `addBlock` via SSH

## 2.7.7

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
  - @milaboratories/pl-http@1.0.6

## 2.7.6

### Patch Changes

- d1f4acf: Network lib upgrade
- Updated dependencies [d1f4acf]
  - @milaboratories/pl-http@1.0.5

## 2.7.5

### Patch Changes

- Updated dependencies [a77b40a]
  - @milaboratories/ts-helpers@1.1.4

## 2.7.4

### Patch Changes

- Updated dependencies [8e92e78]
  - @milaboratories/pl-http@1.0.4

## 2.7.3

### Patch Changes

- 32c7f91: Fixes http-proxy bug in pl-client
- Updated dependencies [02860e7]
  - @milaboratories/pl-http@1.0.3

## 2.7.2

### Patch Changes

- a9b0749: Transaction stats

## 2.7.1

### Patch Changes

- Updated dependencies [8903a30]
  - @milaboratories/pl-http@1.0.2

## 2.7.0

### Minor Changes

- dac7e27: undici and grpc libraries upgrade

### Patch Changes

- 81a1ad7: HTTP2 enabled in HTTP client
- Updated dependencies [93a363a]
- Updated dependencies [dac7e27]
  - @milaboratories/pl-http@1.0.1
  - @milaboratories/ts-helpers@1.1.3

## 2.6.3

### Patch Changes

- Updated dependencies [3dd3a5c]
  - @milaboratories/ts-helpers@1.1.2

## 2.6.2

### Patch Changes

- 80d74a1: Default write tx timeout increased form 20 to 30 seconds

## 2.6.1

### Patch Changes

- b207f86: - client cache size increased to 128 Mb

## 2.6.0

### Minor Changes

- 5113fe4: Separate timeouts for RO and RW transactions. Default timeouts RO = 300s; RW = 20s.

## 2.5.10

### Patch Changes

- 0382abe: Undici & AWS SDK upgrades.

## 2.5.9

### Patch Changes

- 83b50e0: DEFAULT_REQUEST_TIMEOUT changed form 2 seconds to 5 seconds

## 2.5.8

### Patch Changes

- 0573960: "binary" resource added to final predicate, and will be cached from now on

## 2.5.7

### Patch Changes

- Updated dependencies [75b1646]
  - @milaboratories/ts-helpers@1.1.1

## 2.5.6

### Patch Changes

- 50f7459: Dep upgrade, vitest in particular

## 2.5.5

### Patch Changes

- 1d5f1e2: increased default header timeout for http
- 1d5f1e2: dep upgrade

## 2.5.4

### Patch Changes

- 28429fa: Fix a couple of floating promises issues in pl-client

## 2.5.3

### Patch Changes

- 66383b6: Additional resource types support in default "final predicate"

## 2.5.2

### Patch Changes

- 11d30ad: Common final predicate function for pl-client and pl-tree

## 2.5.1

### Patch Changes

- Updated dependencies [9e6e912]
  - @milaboratories/ts-helpers@1.1.0

## 2.5.0

### Minor Changes

- dd26f39: resource data caching layer

## 2.4.21

### Patch Changes

- a5562e9: Added KeepAlive time

## 2.4.20

### Patch Changes

- 36736de: destroy http dispatcher in close method and await termination

## 2.4.19

### Patch Changes

- Updated dependencies [7a04201]
  - @milaboratories/ts-helpers@1.0.30

## 2.4.18

### Patch Changes

- Updated dependencies [1e10161]
  - @milaboratories/ts-helpers@1.0.29

## 2.4.17

### Patch Changes

- Updated dependencies [e65f21d]
  - @milaboratories/ts-helpers@1.0.28

## 2.4.16

### Patch Changes

- 1d1ff16: increased stability of http requests

## 2.4.15

### Patch Changes

- Updated dependencies [fa6d0f2]
  - @milaboratories/ts-helpers@1.0.27

## 2.4.14

### Patch Changes

- Updated dependencies [fcbc2df]
  - @milaboratories/ts-helpers@1.0.26

## 2.4.13

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig
- Updated dependencies [da1e029]
  - @milaboratories/ts-helpers@1.0.25

## 2.4.12

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json
- Updated dependencies [0f3f25f]
  - @milaboratories/ts-helpers@1.0.24

## 2.4.11

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
- Updated dependencies [244e3dc]
  - @milaboratories/ts-helpers@1.0.23
