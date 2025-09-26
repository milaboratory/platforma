# @milaboratories/pl-errors

## 1.1.27

### Patch Changes

- @milaboratories/pl-client@2.13.2

## 1.1.26

### Patch Changes

- Updated dependencies [ee46338]
  - @milaboratories/pl-client@2.13.1

## 1.1.25

### Patch Changes

- Updated dependencies [916de57]
  - @milaboratories/ts-helpers@1.5.0
  - @milaboratories/pl-client@2.13.0

## 1.1.24

### Patch Changes

- Updated dependencies [349375b]
  - @milaboratories/pl-client@2.12.2

## 1.1.23

### Patch Changes

- Updated dependencies [0432c59]
  - @milaboratories/pl-client@2.12.1

## 1.1.22

### Patch Changes

- Updated dependencies [fc0eb68]
  - @milaboratories/pl-client@2.12.0

## 1.1.21

### Patch Changes

- Updated dependencies [3d9638e]
  - @milaboratories/ts-helpers@1.4.7
  - @milaboratories/pl-client@2.11.13

## 1.1.20

### Patch Changes

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

## 1.1.19

### Patch Changes

- Updated dependencies [10a5439]
  - @milaboratories/ts-helpers@1.4.6
  - @milaboratories/pl-client@2.11.12

## 1.1.18

### Patch Changes

- Updated dependencies [d1ad23e]
  - @milaboratories/pl-client@2.11.11

## 1.1.17

### Patch Changes

- b14b2fb: update dist builder
- Updated dependencies [b14b2fb]
  - @milaboratories/pl-client@2.11.10
  - @milaboratories/ts-helpers@1.4.5

## 1.1.16

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/ts-helpers@1.4.4
  - @milaboratories/pl-client@2.11.9

## 1.1.15

### Patch Changes

- Updated dependencies [d1b00dc]
- Updated dependencies [ca79a4e]
  - @milaboratories/pl-client@2.11.8

## 1.1.14

### Patch Changes

- Updated dependencies [4306ff2]
  - @milaboratories/pl-client@2.11.7

## 1.1.13

### Patch Changes

- Updated dependencies [ff4a709]
  - @milaboratories/ts-helpers@1.4.3
  - @milaboratories/pl-client@2.11.6

## 1.1.12

### Patch Changes

- Updated dependencies [188ee1e]
  - @milaboratories/ts-helpers@1.4.2
  - @milaboratories/pl-client@2.11.5

## 1.1.11

### Patch Changes

- Updated dependencies [54e22c2]
  - @milaboratories/pl-client@2.11.4

## 1.1.10

### Patch Changes

- Updated dependencies [4666cae]
  - @milaboratories/pl-client@2.11.3

## 1.1.9

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/ts-helpers@1.4.1
  - @milaboratories/pl-client@2.11.2

## 1.1.8

### Patch Changes

- Updated dependencies [3d34876]
  - @milaboratories/pl-client@2.11.1

## 1.1.7

### Patch Changes

- Updated dependencies [c243d64]
- Updated dependencies [c7894c2]
- Updated dependencies [babb3eb]
  - @milaboratories/pl-client@2.11.0
  - @milaboratories/ts-helpers@1.4.0

## 1.1.6

### Patch Changes

- 49cf7ee: Standard Error serialization/deserialization
- Updated dependencies [49cf7ee]
  - @milaboratories/ts-helpers@1.3.3
  - @milaboratories/pl-client@2.10.2

## 1.1.5

### Patch Changes

- Updated dependencies [f191f2a]
  - @milaboratories/ts-helpers@1.3.2
  - @milaboratories/pl-client@2.10.1

## 1.1.4

### Patch Changes

- Updated dependencies [f7dedbe]
  - @milaboratories/pl-client@2.10.0

## 1.1.3

### Patch Changes

- Updated dependencies [2d5ee55]
  - @milaboratories/pl-client@2.9.3

## 1.1.2

### Patch Changes

- Updated dependencies [0f511ff]
  - @milaboratories/ts-helpers@1.3.1
  - @milaboratories/pl-client@2.9.2

## 1.1.1

### Patch Changes

- Updated dependencies [ce87da7]
  - @milaboratories/ts-helpers@1.3.0
  - @milaboratories/pl-client@2.9.1

## 1.1.0

### Minor Changes

- 3cfc320: support error trace separator

## 1.0.9

### Patch Changes

- Updated dependencies [01a558e]
- Updated dependencies [01a558e]
  - @milaboratories/pl-client@2.9.0
  - @milaboratories/ts-helpers@1.2.0

## 1.0.8

### Patch Changes

- Updated dependencies [5240867]
  - @milaboratories/ts-helpers@1.1.7
  - @milaboratories/pl-client@2.8.2

## 1.0.7

### Patch Changes

- Updated dependencies [56d021e]
  - @milaboratories/ts-helpers@1.1.6
  - @milaboratories/pl-client@2.8.1

## 1.0.6

### Patch Changes

- ba0f7d4: pass errors if we couldn't parse them

## 1.0.5

### Patch Changes

- Updated dependencies [e65a1a6]
  - @milaboratories/pl-client@2.8.0

## 1.0.4

### Patch Changes

- 6e3329e: extract parsed_errors from pl-tree for future using it in computable

## 1.0.3

### Patch Changes

- 9e9a70f: Configure eslint to all "node" packages
- Updated dependencies [9e9a70f]
  - @milaboratories/pl-client@2.7.14

## 1.0.2

### Patch Changes

- Updated dependencies [a505bdb]
  - @milaboratories/pl-client@2.7.13

## 1.0.1

### Patch Changes

- d6a49b2: extract parsed_errors from pl-tree for future using it in computable
