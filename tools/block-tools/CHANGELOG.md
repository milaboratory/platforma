# @platforma-sdk/block-tools

## 2.6.9

### Patch Changes

- Updated dependencies [25c0fed]
  - @milaboratories/ts-helpers@1.5.1
  - @milaboratories/ts-helpers-oclif@1.1.30

## 2.6.8

### Patch Changes

- Updated dependencies [b979236]
  - @milaboratories/pl-http@1.1.8

## 2.6.7

### Patch Changes

- Updated dependencies [916de57]
  - @milaboratories/ts-helpers@1.5.0
  - @milaboratories/pl-model-common@1.20.0
  - @milaboratories/ts-helpers-oclif@1.1.29
  - @milaboratories/pl-model-middle-layer@1.8.29

## 2.6.6

### Patch Changes

- Updated dependencies [0432c59]
  - @milaboratories/pl-model-middle-layer@1.8.28

## 2.6.5

### Patch Changes

- Updated dependencies [fb57534]
  - @milaboratories/pl-model-middle-layer@1.8.27

## 2.6.4

### Patch Changes

- Updated dependencies [662eee0]
  - @milaboratories/pl-model-middle-layer@1.8.26
  - @milaboratories/pl-model-common@1.19.19

## 2.6.3

### Patch Changes

- Updated dependencies [49160c4]
  - @milaboratories/pl-model-common@1.19.18
  - @milaboratories/pl-model-middle-layer@1.8.25

## 2.6.2

### Patch Changes

- Updated dependencies [6bc20d1]
  - @milaboratories/pl-model-common@1.19.17
  - @milaboratories/pl-model-middle-layer@1.8.24

## 2.6.1

### Patch Changes

- Updated dependencies [3d9638e]
  - @milaboratories/pl-model-middle-layer@1.8.23
  - @milaboratories/ts-helpers@1.4.7
  - @milaboratories/pl-model-common@1.19.16
  - @milaboratories/ts-helpers-oclif@1.1.28

## 2.6.0

### Minor Changes

- 0ff2a1b: **Enhanced force mode to support complete package and version removal**

  Force mode in the registry now properly handles complete removal of manually deleted packages and versions:

  - **Complete rebuild**: Force mode now starts with empty overviews instead of loading existing ones, ensuring overviews exactly match storage contents
  - **Automatic cleanup**: Manually deleted packages/versions are automatically removed from registry overviews during force mode refresh
  - **Pre-write snapshots**: Added safety feature that creates backup snapshots with `-prewrite-` suffix before making any changes in force mode
  - **Comprehensive testing**: Added extensive test coverage for deletion scenarios

  **Breaking changes**: None - this enhancement only affects force mode behavior and maintains backward compatibility for normal mode operations.

  **Use case**: This resolves the issue where manually deleted packages would persist in registry overviews because the previous force mode only updated packages found in storage. Now force mode performs a complete rebuild, guaranteeing consistency between storage and overviews.

- 0ff2a1b: **Registry Overview Snapshots & Enhanced Schema Backward Compatibility**

  Added comprehensive snapshot functionality for registry overviews and improved Zod schema compatibility across the entire codebase.

  ## Registry Snapshots (minor)

  - **Automatic backup creation**: Overview files are automatically backed up during every registry update with gzipped compression
  - **Organized storage structure**: Snapshots stored in `_overview_snapshots_v2/global/` and `per_package/` folders mirroring main hierarchy
  - **Security features**: Millisecond timestamps with random suffixes prevent CDN retrieval attacks
  - **CLI management tools**: Added `list-overview-snapshots` and `restore-overview-from-snapshot` commands with safety confirmations
  - **Configurable behavior**: `skipSnapshotCreation` setting allows disabling snapshots when needed
  - **Comprehensive testing**: Full test coverage ensures reliability

  ## Schema Backward Compatibility (patch)

  - **Strategic schema improvements**: Enhanced Zod schemas to prevent data loss during version transitions
  - **Smart classification**: Applied `.passthrough()` to evolving data structures (overviews, manifests, registries, errors) while maintaining `.strict()` for closed types (content types, identifiers)
  - **Wide compatibility coverage**: Updated schemas across block metadata, registry specifications, error structures, and deployment configurations
  - **Forward compatibility**: Older versions will now preserve unknown fields instead of stripping them during parsing

  These improvements ensure robust registry management with automatic backup capabilities and seamless schema evolution without breaking changes.

### Patch Changes

- Updated dependencies [0ff2a1b]
  - @milaboratories/pl-model-middle-layer@1.8.22
  - @milaboratories/pl-model-common@1.19.15

## 2.5.92

### Patch Changes

- Updated dependencies [f848ca0]
  - @milaboratories/pl-model-middle-layer@1.8.21

## 2.5.91

### Patch Changes

- Updated dependencies [a14b8c8]
  - @milaboratories/pl-model-middle-layer@1.8.20

## 2.5.90

### Patch Changes

- Updated dependencies [f5bcdbe]
  - @milaboratories/pl-model-middle-layer@1.8.19

## 2.5.89

### Patch Changes

- Updated dependencies [9acf386]
  - @milaboratories/pl-model-middle-layer@1.8.18

## 2.5.88

### Patch Changes

- Updated dependencies [ef18158]
  - @milaboratories/pl-model-middle-layer@1.8.17

## 2.5.87

### Patch Changes

- Updated dependencies [2a21be5]
  - @milaboratories/pl-model-common@1.19.14
  - @milaboratories/pl-model-middle-layer@1.8.16

## 2.5.86

### Patch Changes

- Updated dependencies [10a5439]
- Updated dependencies [10a5439]
  - @milaboratories/pl-model-middle-layer@1.8.15
  - @milaboratories/ts-helpers@1.4.6
  - @milaboratories/ts-helpers-oclif@1.1.27

## 2.5.85

### Patch Changes

- Updated dependencies [dc289eb]
  - @milaboratories/pl-model-middle-layer@1.8.14

## 2.5.84

### Patch Changes

- Updated dependencies [9508f78]
  - @milaboratories/pl-model-middle-layer@1.8.13

## 2.5.83

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/ts-helpers-oclif@1.1.26
  - @milaboratories/resolve-helper@1.1.1
  - @milaboratories/pl-model-middle-layer@1.8.8
  - @milaboratories/ts-helpers@1.4.4
  - @milaboratories/pl-model-common@1.19.8
  - @milaboratories/pl-http@1.1.6

## 2.5.82

### Patch Changes

- d1b00dc: Added --unstable flag to publish command to control stable channel assignment. When --unstable flag is not set (default behavior), published packages are automatically added to the stable channel. When --unstable flag is set, packages are published without being added to the stable channel. Also added PL_PUBLISH_UNSTABLE environment variable support.

  Added gzipped version of global overview file. The registry now creates both the regular overview.json file and a compressed overview.json.gz file with identical content to improve download performance.

## 2.5.81

### Patch Changes

- Updated dependencies [b8105fb]
  - @milaboratories/pl-model-middle-layer@1.8.7
  - @milaboratories/pl-model-common@1.19.4

## 2.5.80

### Patch Changes

- Updated dependencies [6d6c4ba]
  - @milaboratories/pl-model-common@1.19.3
  - @milaboratories/pl-model-middle-layer@1.8.6

## 2.5.79

### Patch Changes

- Updated dependencies [017a888]
  - @milaboratories/pl-model-common@1.19.2
  - @milaboratories/pl-model-middle-layer@1.8.5

## 2.5.78

### Patch Changes

- Updated dependencies [ff4a709]
  - @milaboratories/ts-helpers@1.4.3
  - @milaboratories/ts-helpers-oclif@1.1.25

## 2.5.77

### Patch Changes

- Updated dependencies [636088d]
- Updated dependencies [636088d]
  - @milaboratories/pl-model-middle-layer@1.8.4
  - @milaboratories/pl-model-common@1.19.1

## 2.5.76

### Patch Changes

- Updated dependencies [98b0ded]
  - @milaboratories/pl-model-common@1.19.0
  - @milaboratories/pl-model-middle-layer@1.8.3

## 2.5.75

### Patch Changes

- Updated dependencies [3271446]
  - @milaboratories/pl-model-common@1.18.0
  - @milaboratories/pl-model-middle-layer@1.8.2

## 2.5.74

### Patch Changes

- Updated dependencies [ef9f418]
  - @milaboratories/pl-model-middle-layer@1.8.1

## 2.5.73

### Patch Changes

- Updated dependencies [188ee1e]
  - @milaboratories/ts-helpers@1.4.2
  - @milaboratories/ts-helpers-oclif@1.1.24

## 2.5.72

### Patch Changes

- 76e485b: Fix stripping block pack manifest fields from newer sdk versions

## 2.5.71

### Patch Changes

- Updated dependencies [e7c0edb]
  - @milaboratories/pl-model-middle-layer@1.8.0
  - @milaboratories/pl-model-common@1.17.0

## 2.5.70

### Patch Changes

- Updated dependencies [9bb26ff]
  - @milaboratories/pl-model-common@1.16.5
  - @milaboratories/pl-model-middle-layer@1.7.52

## 2.5.69

### Patch Changes

- Updated dependencies [c12345a]
  - @milaboratories/pl-model-common@1.16.4
  - @milaboratories/pl-model-middle-layer@1.7.51

## 2.5.68

### Patch Changes

- Updated dependencies [7afc448]
  - @milaboratories/pl-model-middle-layer@1.7.50

## 2.5.67

### Patch Changes

- Updated dependencies [7be8a2b]
  - @milaboratories/pl-model-common@1.16.3
  - @milaboratories/pl-model-middle-layer@1.7.49

## 2.5.66

### Patch Changes

- Updated dependencies [dfb0086]
  - @milaboratories/pl-model-common@1.16.2
  - @milaboratories/pl-model-middle-layer@1.7.48

## 2.5.65

### Patch Changes

- Updated dependencies [d525c60]
  - @milaboratories/pl-model-common@1.16.1
  - @milaboratories/pl-model-middle-layer@1.7.47

## 2.5.64

### Patch Changes

- Updated dependencies [98d48f6]
  - @milaboratories/pl-model-middle-layer@1.7.46

## 2.5.63

### Patch Changes

- Updated dependencies [a0c607a]
  - @milaboratories/pl-model-middle-layer@1.7.45

## 2.5.62

### Patch Changes

- Updated dependencies [3b46d33]
  - @milaboratories/pl-model-common@1.16.0
  - @milaboratories/pl-model-middle-layer@1.7.44

## 2.5.61

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.43

## 2.5.60

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.42

## 2.5.59

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/ts-helpers-oclif@1.1.23
  - @milaboratories/pl-model-middle-layer@1.7.41
  - @milaboratories/ts-helpers@1.4.1
  - @milaboratories/pl-http@1.1.4

## 2.5.58

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.40

## 2.5.57

### Patch Changes

- Updated dependencies [2bcc47f]
  - @milaboratories/pl-model-middle-layer@1.7.39

## 2.5.56

### Patch Changes

- Updated dependencies [619f490]
  - @milaboratories/pl-model-middle-layer@1.7.38

## 2.5.55

### Patch Changes

- Updated dependencies [c243d64]
- Updated dependencies [c7894c2]
  - @milaboratories/pl-http@1.1.3
  - @milaboratories/ts-helpers@1.4.0
  - @milaboratories/ts-helpers-oclif@1.1.22

## 2.5.54

### Patch Changes

- Updated dependencies [49cf7ee]
  - @milaboratories/ts-helpers@1.3.3
  - @milaboratories/ts-helpers-oclif@1.1.21
  - @milaboratories/pl-model-middle-layer@1.7.37

## 2.5.53

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.36

## 2.5.52

### Patch Changes

- Updated dependencies [f191f2a]
  - @milaboratories/ts-helpers@1.3.2
  - @milaboratories/ts-helpers-oclif@1.1.20
  - @milaboratories/pl-model-middle-layer@1.7.35

## 2.5.51

### Patch Changes

- Updated dependencies [0f511ff]
  - @milaboratories/ts-helpers@1.3.1
  - @milaboratories/ts-helpers-oclif@1.1.19

## 2.5.50

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.34

## 2.5.49

### Patch Changes

- Updated dependencies [ce87da7]
  - @milaboratories/ts-helpers@1.3.0
  - @milaboratories/ts-helpers-oclif@1.1.18

## 2.5.48

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.33

## 2.5.47

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.32

## 2.5.46

### Patch Changes

- Updated dependencies [94468e0]
  - @milaboratories/pl-model-middle-layer@1.7.31

## 2.5.45

### Patch Changes

- Updated dependencies [8e23a2e]
  - @milaboratories/pl-model-middle-layer@1.7.30

## 2.5.44

### Patch Changes

- Updated dependencies [ab9fefd]
  - @milaboratories/pl-model-middle-layer@1.7.29

## 2.5.43

### Patch Changes

- Updated dependencies [fc7d156]
  - @milaboratories/pl-model-middle-layer@1.7.28

## 2.5.42

### Patch Changes

- Updated dependencies [01a558e]
  - @milaboratories/ts-helpers@1.2.0
  - @milaboratories/pl-model-middle-layer@1.7.27
  - @milaboratories/ts-helpers-oclif@1.1.17

## 2.5.41

### Patch Changes

- Updated dependencies [5240867]
  - @milaboratories/ts-helpers@1.1.7
  - @milaboratories/ts-helpers-oclif@1.1.16

## 2.5.40

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.26

## 2.5.39

### Patch Changes

- Updated dependencies [56d021e]
  - @milaboratories/ts-helpers@1.1.6
  - @milaboratories/ts-helpers-oclif@1.1.15

## 2.5.38

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.25

## 2.5.37

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.24

## 2.5.36

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.23

## 2.5.35

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.22

## 2.5.34

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.21

## 2.5.33

### Patch Changes

- Updated dependencies [962c620]
  - @milaboratories/pl-model-middle-layer@1.7.20

## 2.5.32

### Patch Changes

- Updated dependencies [2490c21]
  - @milaboratories/pl-model-middle-layer@1.7.19

## 2.5.31

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.18

## 2.5.30

### Patch Changes

- Updated dependencies [e82d0b8]
  - @milaboratories/pl-model-middle-layer@1.7.17

## 2.5.29

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.16

## 2.5.28

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.15

## 2.5.27

### Patch Changes

- Updated dependencies [9e9a70f]
  - @milaboratories/ts-helpers-oclif@1.1.14
  - @milaboratories/ts-helpers@1.1.5
  - @milaboratories/pl-http@1.1.2
  - @milaboratories/pl-model-middle-layer@1.7.14

## 2.5.26

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.13

## 2.5.25

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.12

## 2.5.24

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
  - @milaboratories/pl-http@1.1.1
  - @milaboratories/pl-model-middle-layer@1.7.11
  - @milaboratories/ts-helpers@1.1.4
  - @milaboratories/ts-helpers-oclif@1.1.13

## 2.5.23

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.10

## 2.5.22

### Patch Changes

- Updated dependencies [af43efe]
  - @milaboratories/resolve-helper@1.1.0

## 2.5.21

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.9

## 2.5.20

### Patch Changes

- Updated dependencies [f4ec096]
  - @milaboratories/pl-model-middle-layer@1.7.8

## 2.5.19

### Patch Changes

- Updated dependencies [624af88]
  - @milaboratories/pl-model-middle-layer@1.7.7

## 2.5.18

### Patch Changes

- Updated dependencies [3bf8838]
  - @milaboratories/pl-http@1.1.0

## 2.5.17

### Patch Changes

- Updated dependencies [e6ad278]
  - @milaboratories/pl-http@1.0.7

## 2.5.16

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

## 2.5.15

### Patch Changes

- d1f4acf: Network lib upgrade
- Updated dependencies [d1f4acf]
  - @milaboratories/pl-http@1.0.5

## 2.5.14

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.6

## 2.5.13

### Patch Changes

- Updated dependencies [23dd55f]
  - @milaboratories/pl-model-middle-layer@1.7.5

## 2.5.12

### Patch Changes

- Updated dependencies [1789f1e]
  - @milaboratories/pl-model-middle-layer@1.7.4

## 2.5.11

### Patch Changes

- Updated dependencies [aee59da]
  - @milaboratories/pl-model-middle-layer@1.7.3

## 2.5.10

### Patch Changes

- a77b40a: add `any` everywhere, ssh: persistent connection; upload: dynamic part chooser
- Updated dependencies [a77b40a]
  - @milaboratories/ts-helpers@1.1.4
  - @milaboratories/ts-helpers-oclif@1.1.13

## 2.5.9

### Patch Changes

- Updated dependencies [8e92e78]
  - @milaboratories/pl-http@1.0.4

## 2.5.8

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.2

## 2.5.7

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.7.1

## 2.5.6

### Patch Changes

- Updated dependencies [02860e7]
  - @milaboratories/pl-http@1.0.3

## 2.5.5

### Patch Changes

- c4dd069: Fix for getUpdateSuggestions method with changel === "any"

## 2.5.4

### Patch Changes

- Updated dependencies [3da2292]
  - @milaboratories/pl-model-middle-layer@1.7.0

## 2.5.3

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.11

## 2.5.2

### Patch Changes

- Updated dependencies [c2161da]
  - @milaboratories/pl-model-middle-layer@1.6.10

## 2.5.1

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.9

## 2.5.0

### Minor Changes

- 69b15fe: Multiple for block registry reader

## 2.4.12

### Patch Changes

- 8903a30: Dependency upgrade
- Updated dependencies [8903a30]
  - @milaboratories/pl-model-middle-layer@1.6.8
  - @milaboratories/pl-http@1.0.2

## 2.4.11

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.7

## 2.4.10

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.6

## 2.4.9

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.6.5

## 2.4.8

### Patch Changes

- dac7e27: Additional retry logic in registry v2 reader
- Updated dependencies [93a363a]
- Updated dependencies [dac7e27]
  - @milaboratories/pl-http@1.0.1
  - @milaboratories/ts-helpers@1.1.3
  - @milaboratories/ts-helpers-oclif@1.1.12

## 2.4.7

### Patch Changes

- ed6b79c: Channel argument added to getSpecificOverview in RegistryReaderV2

## 2.4.6

### Patch Changes

- Updated dependencies [7cf4db8]
  - @milaboratories/pl-model-middle-layer@1.6.4

## 2.4.5

### Patch Changes

- Updated dependencies [5692733]
  - @milaboratories/pl-model-middle-layer@1.6.3

## 2.4.4

### Patch Changes

- Updated dependencies [7be05ec]
  - @milaboratories/pl-model-middle-layer@1.6.2

## 2.4.3

### Patch Changes

- 32c3157: - fix: S3 storage empty folder listing
  - new `refresh-registry` action in `block-tools` with dry-run support

## 2.4.2

### Patch Changes

- Updated dependencies [6240ac0]
  - @milaboratories/pl-model-middle-layer@1.6.1

## 2.4.1

### Patch Changes

- Updated dependencies [3dd3a5c]
  - @milaboratories/ts-helpers@1.1.2
  - @milaboratories/ts-helpers-oclif@1.1.11

## 2.4.0

### Minor Changes

- 3b138a4: Block registry now supports channels

### Patch Changes

- Updated dependencies [3b138a4]
  - @milaboratories/pl-model-middle-layer@1.6.0

## 2.3.30

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.13

## 2.3.29

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.12

## 2.3.28

### Patch Changes

- Updated dependencies [cd9ca74]
  - @milaboratories/resolve-helper@1.0.2

## 2.3.27

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.11

## 2.3.26

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.10

## 2.3.25

### Patch Changes

- Updated dependencies [b04a78a]
  - @milaboratories/pl-model-middle-layer@1.5.9

## 2.3.24

### Patch Changes

- Updated dependencies [be7caff]
  - @milaboratories/pl-model-middle-layer@1.5.8

## 2.3.23

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.7

## 2.3.22

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.6

## 2.3.21

### Patch Changes

- Updated dependencies [75b1646]
  - @milaboratories/ts-helpers@1.1.1
  - @milaboratories/ts-helpers-oclif@1.1.10

## 2.3.20

### Patch Changes

- 50f7459: Dep upgrade, vitest in particular

## 2.3.19

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.5

## 2.3.18

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.4

## 2.3.17

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.3

## 2.3.16

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.2

## 2.3.15

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.5.1

## 2.3.14

### Patch Changes

- Updated dependencies [9e6e912]
- Updated dependencies [9e6e912]
  - @milaboratories/ts-helpers@1.1.0
  - @milaboratories/pl-model-middle-layer@1.5.0
  - @milaboratories/ts-helpers-oclif@1.1.9

## 2.3.13

### Patch Changes

- Updated dependencies [4a6e11f]
  - @milaboratories/pl-model-middle-layer@1.4.5

## 2.3.12

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.4.4

## 2.3.11

### Patch Changes

- Updated dependencies [7a04201]
  - @milaboratories/ts-helpers@1.0.30
  - @milaboratories/ts-helpers-oclif@1.1.8

## 2.3.10

### Patch Changes

- Updated dependencies [1e10161]
  - @milaboratories/ts-helpers@1.0.29
  - @milaboratories/ts-helpers-oclif@1.1.7

## 2.3.9

### Patch Changes

- bfd40b4: Additional logging and fixes for block watcher & poll pool

## 2.3.8

### Patch Changes

- 05cd19b: Use oclif-index script to build index file with commands

## 2.3.7

### Patch Changes

- Updated dependencies [094fbf7]
  - @milaboratories/pl-model-middle-layer@1.4.3

## 2.3.6

### Patch Changes

- 86c8d0f: multilayer caching of results in V2 registry reader

## 2.3.5

### Patch Changes

- Updated dependencies [e65f21d]
  - @milaboratories/ts-helpers@1.0.28
  - @milaboratories/ts-helpers-oclif@1.1.6

## 2.3.4

### Patch Changes

- 1654819: fix for absolute path in ui tgz file

## 2.3.3

### Patch Changes

- Updated dependencies [7f86668]
  - @milaboratories/pl-model-middle-layer@1.4.2

## 2.3.2

### Patch Changes

- 314e9ed: fix for relative path resolution in V2 registry reader

## 2.3.1

### Patch Changes

- 2ea865e: final implementation for registry v2 reader and block materializer
- Updated dependencies [2ea865e]
  - @milaboratories/pl-model-middle-layer@1.4.1

## 2.3.0

### Minor Changes

- fa6d0f2: V2 Registry API

### Patch Changes

- Updated dependencies [fa6d0f2]
  - @milaboratories/pl-model-middle-layer@1.4.0
  - @milaboratories/ts-helpers@1.0.27
  - @milaboratories/ts-helpers-oclif@1.1.5

## 2.2.0

### Minor Changes

- 81aa0c7: initial implementation of publish command for V2 block registry

### Patch Changes

- Updated dependencies [81aa0c7]
  - @milaboratories/pl-model-middle-layer@1.3.0

## 2.1.11

### Patch Changes

- fcbc2df: fixes for proper bundling and require/import compatibility
- 41b10cd: another set of fixes for ESM / CJS compatibility
- Updated dependencies [fcbc2df]
- Updated dependencies [41b10cd]
  - @milaboratories/ts-helpers@1.0.26
  - @milaboratories/resolve-helper@1.0.1
  - @milaboratories/ts-helpers-oclif@1.1.4

## 2.1.10

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.2.20

## 2.1.9

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig
- Updated dependencies [da1e029]
  - @milaboratories/pl-model-middle-layer@1.2.19
  - @milaboratories/ts-helpers@1.0.25
  - @milaboratories/ts-helpers-oclif@1.1.3

## 2.1.8

### Patch Changes

- e019b36: semver moved to dev deps

## 2.1.7

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json
- Updated dependencies [0f3f25f]
  - @milaboratories/ts-helpers-oclif@1.1.2
  - @milaboratories/pl-model-middle-layer@1.2.18
  - @milaboratories/ts-helpers@1.0.24

## 2.1.6

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
- Updated dependencies [244e3dc]
  - @milaboratories/ts-helpers-oclif@1.1.1
  - @milaboratories/pl-model-middle-layer@1.2.17
  - @milaboratories/ts-helpers@1.0.23
