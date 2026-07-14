# @milaboratories/pl-model-backend

## 1.4.16

### Patch Changes

- @milaboratories/pl-client@3.14.2

## 1.4.15

### Patch Changes

- @milaboratories/pl-client@3.14.1

## 1.4.14

### Patch Changes

- Updated dependencies [dbe7fdb]
  - @milaboratories/pl-client@3.14.0

## 1.4.13

### Patch Changes

- @milaboratories/pl-client@3.13.2

## 1.4.12

### Patch Changes

- Updated dependencies [effca5f]
  - @milaboratories/pl-client@3.13.1

## 1.4.11

### Patch Changes

- Updated dependencies [ffa04e7]
  - @milaboratories/pl-client@3.13.0

## 1.4.10

### Patch Changes

- Updated dependencies [3df748f]
  - @milaboratories/pl-client@3.12.1

## 1.4.9

### Patch Changes

- Updated dependencies [528f66d]
  - @milaboratories/pl-client@3.12.0

## 1.4.8

### Patch Changes

- @milaboratories/pl-client@3.11.5

## 1.4.7

### Patch Changes

- @milaboratories/pl-client@3.11.4

## 1.4.6

### Patch Changes

- @milaboratories/pl-client@3.11.3

## 1.4.5

### Patch Changes

- @milaboratories/pl-client@3.11.2

## 1.4.4

### Patch Changes

- @milaboratories/pl-client@3.11.1

## 1.4.3

### Patch Changes

- Updated dependencies [e61785b]
  - @milaboratories/pl-client@3.11.0

## 1.4.2

### Patch Changes

- @milaboratories/pl-client@3.10.2

## 1.4.1

### Patch Changes

- @milaboratories/pl-client@3.10.1

## 1.4.0

### Minor Changes

- 0a3af02: MILAB-6145: tengo-builder learns a `wasm` artefact type; declare WASM runtime requirement on packed blocks.

  - `pl-tengo` detects `assets.importWasm("@pkg:id")` in tengo sources (regex-based, like the other `import*` calls) and resolves the bytes from each dependency's `package.json` `exports[*].wasm` condition. Subpath `.` maps to id `main`; `./foo` maps to id `foo`.
  - `@platforma-sdk/workflow-tengo`'s `assets` lib gains `importWasm(name)`, a thin wrapper over the new `plapi.loadWasm` host builtin. Returns the component's WIT-interface map directly — block authors index by canonical WIT interface name and JSON-marshal arguments / results at the call site. No SDK-side wrapper per consumer; the consuming file mentions the package id directly (same pattern as `importSoftware` / `importAsset`).
  - `BlockPackMeta` gains `requiredCapabilities?: string[]` — Desktop matches it
    against the backend's `serverInfo.capabilities` at install time. Forward-
    compatible with old Desktops (Zod's `z.object` strips unknown keys).
  - `pl-client`'s `MaintenanceAPI.Ping.Response` exposes the new `capabilities` field added in pl backend (proto field 9).
  - `pl-middle-layer` exposes a `serverCapabilities` getter alongside the existing `serverPlatform`.
  - `pl-tengo` enforces two build-time size guards that mirror backend ingest caps: each `.wasm` file must be ≤ 2 MiB raw (the backend stores it as a value resource, capped at 3 MiB after base64+JSON marshal), and each gzipped template pack must be ≤ ~3.4 MiB (backend `TemplatePackSizeLimit` is 3.5 MiB). Failures point at the offending artefact and, for over-large packs, list each WASM in the tree by size — so block authors see the cause at build time instead of getting an opaque "resource too large" error at publish or render.
  - `pl-client`'s `TestHelpers.getTestClient` JWT cache now keys on the live backend `instanceId` in addition to address / user / password / expiration. Prevents a stale JWT issued by a previous backend run (rotated `instanceId`) being handed to the first authenticated call after a restart — the test fixture re-logs in instead of surfacing `failed to authenticate request using any of available methods`.

### Patch Changes

- Updated dependencies [0a3af02]
  - @milaboratories/pl-client@3.10.0

## 1.3.5

### Patch Changes

- Updated dependencies [0c317f5]
  - @milaboratories/pl-client@3.9.2

## 1.3.4

### Patch Changes

- Updated dependencies [a0a909c]
  - @milaboratories/pl-client@3.9.1

## 1.3.3

### Patch Changes

- Updated dependencies [0ce161f]
  - @milaboratories/pl-client@3.9.0

## 1.3.2

### Patch Changes

- Updated dependencies [af6f1c0]
  - @milaboratories/pl-client@3.8.1

## 1.3.1

### Patch Changes

- Updated dependencies [c097727]
  - @milaboratories/pl-client@3.8.0

## 1.3.0

### Minor Changes

- 030e8c2: MILAB-6145: tengo-builder learns a `wasm` artefact type; declare WASM runtime requirement on packed blocks.

  - `pl-tengo` detects `assets.importWasm("@pkg:id")` in tengo sources (regex-based, like the other `import*` calls) and resolves the bytes from each dependency's `package.json` `exports[*].wasm` condition. Subpath `.` maps to id `main`; `./foo` maps to id `foo`.
  - `@platforma-sdk/workflow-tengo` ships a new opt-in lib `:pframes-rs` that wraps `assets.importWasm("@milaboratories/pframes-rs-wasip2:main")`. Blocks that import `:pframes-rs` automatically pull the 1.7 MB pframes-rs wasm into their templates' packs; blocks that don't stay lean.
  - `BlockPackMeta` gains `requiredCapabilities?: string[]` — Desktop matches it
    against the backend's `serverInfo.capabilities` at install time. Forward-
    compatible with old Desktops (Zod's `z.object` strips unknown keys).
  - `pl-client`'s `MaintenanceAPI.Ping.Response` exposes the new `capabilities` field added in pl backend (proto field 9).
  - `pl-middle-layer` exposes a `serverCapabilities` getter alongside the existing `serverPlatform`.
  - `pl-tengo` enforces two build-time size guards that mirror backend ingest caps: each `.wasm` file must be ≤ 2 MiB raw (the backend stores it as a value resource, capped at 3 MiB after base64+JSON marshal), and each gzipped template pack must be ≤ ~3.4 MiB (backend `TemplatePackSizeLimit` is 3.5 MiB). Failures point at the offending artefact and, for over-large packs, list each WASM in the tree by size — so block authors see the cause at build time instead of getting an opaque "resource too large" error at publish or render.

### Patch Changes

- Updated dependencies [030e8c2]
  - @milaboratories/pl-client@3.7.0

## 1.2.30

### Patch Changes

- Updated dependencies [6066082]
  - @milaboratories/pl-client@3.6.0

## 1.2.29

### Patch Changes

- Updated dependencies [b1ea44e]
  - @milaboratories/pl-client@3.5.0

## 1.2.28

### Patch Changes

- @milaboratories/pl-client@3.4.2

## 1.2.27

### Patch Changes

- Updated dependencies [bcf1107]
  - @milaboratories/pl-client@3.4.1

## 1.2.26

### Patch Changes

- Updated dependencies [e65c3b9]
  - @milaboratories/pl-client@3.4.0

## 1.2.25

### Patch Changes

- @milaboratories/pl-client@3.3.3

## 1.2.24

### Patch Changes

- @milaboratories/pl-client@3.3.2

## 1.2.23

### Patch Changes

- @milaboratories/pl-client@3.3.1

## 1.2.22

### Patch Changes

- Updated dependencies [72a9e61]
  - @milaboratories/pl-client@3.3.0

## 1.2.21

### Patch Changes

- @milaboratories/pl-client@3.2.5

## 1.2.20

### Patch Changes

- @milaboratories/pl-client@3.2.4

## 1.2.19

### Patch Changes

- @milaboratories/pl-client@3.2.3

## 1.2.18

### Patch Changes

- @milaboratories/pl-client@3.2.2

## 1.2.17

### Patch Changes

- @milaboratories/pl-client@3.2.1

## 1.2.16

### Patch Changes

- Updated dependencies [58a28bc]
  - @milaboratories/pl-client@3.2.0

## 1.2.15

### Patch Changes

- @milaboratories/pl-client@3.1.8

## 1.2.14

### Patch Changes

- @milaboratories/pl-client@3.1.7

## 1.2.13

### Patch Changes

- @milaboratories/pl-client@3.1.6

## 1.2.12

### Patch Changes

- @milaboratories/pl-client@3.1.5

## 1.2.11

### Patch Changes

- @milaboratories/pl-client@3.1.4

## 1.2.10

### Patch Changes

- @milaboratories/pl-client@3.1.3

## 1.2.9

### Patch Changes

- @milaboratories/pl-client@3.1.2

## 1.2.8

### Patch Changes

- @milaboratories/pl-client@3.1.1

## 1.2.7

### Patch Changes

- Updated dependencies [96b0516]
  - @milaboratories/pl-client@3.1.0

## 1.2.6

### Patch Changes

- Updated dependencies [de415f7]
  - @milaboratories/pl-client@3.0.0

## 1.2.5

### Patch Changes

- @milaboratories/pl-client@2.18.5

## 1.2.4

### Patch Changes

- @milaboratories/pl-client@2.18.4

## 1.2.3

### Patch Changes

- @milaboratories/pl-client@2.18.3

## 1.2.2

### Patch Changes

- @milaboratories/pl-client@2.18.2

## 1.2.1

### Patch Changes

- @milaboratories/pl-client@2.18.1

## 1.2.0

### Minor Changes

- d59f5fe: New collection columns implementation

### Patch Changes

- Updated dependencies [d59f5fe]
  - @milaboratories/pl-client@2.18.0

## 1.1.59

### Patch Changes

- @milaboratories/pl-client@2.17.12

## 1.1.58

### Patch Changes

- @milaboratories/pl-client@2.17.11

## 1.1.57

### Patch Changes

- @milaboratories/pl-client@2.17.10

## 1.1.56

### Patch Changes

- Updated dependencies [c19a02b]
  - @milaboratories/pl-client@2.17.9

## 1.1.55

### Patch Changes

- 79156bc: fix dense axis
- Updated dependencies [79156bc]
  - @milaboratories/pl-client@2.17.8

## 1.1.54

### Patch Changes

- @milaboratories/pl-client@2.17.7

## 1.1.53

### Patch Changes

- @milaboratories/pl-client@2.17.6

## 1.1.52

### Patch Changes

- @milaboratories/pl-client@2.17.5

## 1.1.51

### Patch Changes

- @milaboratories/pl-client@2.17.4

## 1.1.50

### Patch Changes

- @milaboratories/pl-client@2.17.3

## 1.1.49

### Patch Changes

- @milaboratories/pl-client@2.17.2

## 1.1.48

### Patch Changes

- @milaboratories/pl-client@2.17.1

## 1.1.47

### Patch Changes

- Updated dependencies [f37108b]
  - @milaboratories/pl-client@2.17.0

## 1.1.46

### Patch Changes

- Updated dependencies [c620234]
  - @milaboratories/pl-client@2.16.29

## 1.1.45

### Patch Changes

- a6ea24f: silent ci tests
- Updated dependencies [a6ea24f]
  - @milaboratories/pl-client@2.16.28

## 1.1.44

### Patch Changes

- f89a883: full integration oxc
- Updated dependencies [f89a883]
  - @milaboratories/pl-client@2.16.27

## 1.1.43

### Patch Changes

- @milaboratories/pl-client@2.16.26

## 1.1.42

### Patch Changes

- @milaboratories/pl-client@2.16.25

## 1.1.41

### Patch Changes

- @milaboratories/pl-client@2.16.24

## 1.1.40

### Patch Changes

- @milaboratories/pl-client@2.16.23

## 1.1.39

### Patch Changes

- Updated dependencies [0044f7f]
  - @milaboratories/pl-client@2.16.22

## 1.1.38

### Patch Changes

- @milaboratories/pl-client@2.16.21

## 1.1.37

### Patch Changes

- @milaboratories/pl-client@2.16.20

## 1.1.36

### Patch Changes

- @milaboratories/pl-client@2.16.19

## 1.1.35

### Patch Changes

- Updated dependencies [edbbd2e]
  - @milaboratories/pl-client@2.16.18

## 1.1.34

### Patch Changes

- Updated dependencies [2762d16]
  - @milaboratories/pl-client@2.16.17

## 1.1.33

### Patch Changes

- Updated dependencies [2dc3476]
  - @milaboratories/pl-client@2.16.16

## 1.1.32

### Patch Changes

- Updated dependencies [4fceb9d]
  - @milaboratories/pl-client@2.16.15

## 1.1.31

### Patch Changes

- Updated dependencies [6b35c32]
  - @milaboratories/pl-client@2.16.14

## 1.1.30

### Patch Changes

- @milaboratories/pl-client@2.16.13

## 1.1.29

### Patch Changes

- Updated dependencies [ebc6664]
  - @milaboratories/pl-client@2.16.12

## 1.1.28

### Patch Changes

- Updated dependencies [ba792d4]
  - @milaboratories/pl-client@2.16.11

## 1.1.27

### Patch Changes

- @milaboratories/pl-client@2.16.10

## 1.1.26

### Patch Changes

- @milaboratories/pl-client@2.16.9

## 1.1.25

### Patch Changes

- @milaboratories/pl-client@2.16.8

## 1.1.24

### Patch Changes

- @milaboratories/pl-client@2.16.7

## 1.1.23

### Patch Changes

- @milaboratories/pl-client@2.16.6

## 1.1.22

### Patch Changes

- @milaboratories/pl-client@2.16.5

## 1.1.21

### Patch Changes

- Updated dependencies [c3ce3ce]
  - @milaboratories/pl-client@2.16.4

## 1.1.20

### Patch Changes

- @milaboratories/pl-client@2.16.3

## 1.1.19

### Patch Changes

- Updated dependencies [99be920]
  - @milaboratories/pl-client@2.16.2

## 1.1.18

### Patch Changes

- @milaboratories/pl-client@2.16.1

## 1.1.17

### Patch Changes

- Updated dependencies [7af7faf]
  - @milaboratories/pl-client@2.16.0

## 1.1.16

### Patch Changes

- @milaboratories/pl-client@2.15.1

## 1.1.15

### Patch Changes

- Updated dependencies [d5a8713]
  - @milaboratories/pl-client@2.15.0

## 1.1.14

### Patch Changes

- Updated dependencies [a9517a8]
  - @milaboratories/pl-client@2.14.0

## 1.1.13

### Patch Changes

- @milaboratories/pl-client@2.13.3

## 1.1.12

### Patch Changes

- @milaboratories/pl-client@2.13.2

## 1.1.11

### Patch Changes

- Updated dependencies [ee46338]
  - @milaboratories/pl-client@2.13.1

## 1.1.10

### Patch Changes

- Updated dependencies [916de57]
  - @milaboratories/pl-client@2.13.0

## 1.1.9

### Patch Changes

- Updated dependencies [349375b]
  - @milaboratories/pl-client@2.12.2

## 1.1.8

### Patch Changes

- Updated dependencies [0432c59]
  - @milaboratories/pl-client@2.12.1

## 1.1.7

### Patch Changes

- Updated dependencies [fc0eb68]
  - @milaboratories/pl-client@2.12.0

## 1.1.6

### Patch Changes

- Updated dependencies [3d9638e]
  - @milaboratories/pl-client@2.11.13

## 1.1.5

### Patch Changes

- @milaboratories/pl-client@2.11.12

## 1.1.4

### Patch Changes

- b14b2fb: update dist builder
- Updated dependencies [b14b2fb]
  - @milaboratories/pl-client@2.11.10

## 1.1.3

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/pl-client@2.11.9

## 1.1.2

### Patch Changes

- d60b0fe: Chore: fix linter errors

## 1.1.1

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/pl-client@2.11.2

## 1.1.0

### Minor Changes

- 6506dec: templates: support v3 version where we store source code in a hash map rather than in every leaf of the template tree. It will help a lot with build times and loading times of "Add Block" button

## 1.0.4

### Patch Changes

- 2e8b782: Use non-blocking gunzip to extract template content

## 1.0.3

### Patch Changes

- 4812a12: apply eslint rules to the all "model" packages

## 1.0.2

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

## 1.0.1

### Patch Changes

- 87790da: Middle layer now renders template tree on its own instead of uploading template pack to the server
