# @platforma-sdk/model

## 1.29.13

### Patch Changes

- 37e6f75: fix doubling columns in result
- Updated dependencies [f9bc9a8]
  - @milaboratories/pl-model-common@1.13.7

## 1.29.12

### Patch Changes

- 621e15a: PlAgDataTableV2 component (does not include hidden columns in join)
- Updated dependencies [621e15a]
  - @milaboratories/pl-model-common@1.13.6

## 1.29.2

### Patch Changes

- Updated dependencies [21233c2]
  - @milaboratories/pl-model-common@1.13.5

## 1.29.0

### Minor Changes

- fed27f0: Use axisKeys to retrive axis labels

## 1.28.4

### Patch Changes

- 8142f77: Fixes a bug potentially leading to infinite loop in deriveLabels

## 1.28.1

### Patch Changes

- 69bd963: Fixes cases where empty label can be derived by deriveLabels

## 1.28.0

### Minor Changes

- 43e1c65: Significant refactoring for anchored column APIs & PColumnCollection class isolation

### Patch Changes

- Updated dependencies [43e1c65]
  - @milaboratories/pl-model-common@1.13.4

## 1.27.17

### Patch Changes

- 11f6e3e: Added find labels for p-column axis method to result pool

## 1.27.10

### Patch Changes

- Updated dependencies [ff0f92c]
  - @milaboratories/pl-error-like@1.12.0
  - @milaboratories/pl-model-common@1.13.3

## 1.27.8

### Patch Changes

- Updated dependencies [962c620]
  - @milaboratories/pl-model-common@1.13.2

## 1.27.6

### Patch Changes

- Updated dependencies [2fc07ba]
  - @milaboratories/pl-model-common@1.13.1

## 1.26.0

### Minor Changes

- c57f609: ResultPool.getAnchoredPColumns with full suppport of column axis splitting & API for explicit PColumn Data.

### Patch Changes

- Updated dependencies [7c52bb5]
  - @milaboratories/pl-model-common@1.13.0

## 1.25.0

### Minor Changes

- 88cebeb: getCanonicalOptions API returning options with SUniversalPColumnId references (full support of Anchored Columns API)

### Patch Changes

- Updated dependencies [88cebeb]
  - @milaboratories/pl-model-common@1.12.0

## 1.24.11

### Patch Changes

- Updated dependencies [9e9a70f]
  - @milaboratories/pl-model-common@1.11.4

## 1.24.10

### Patch Changes

- 4812a12: apply eslint rules to the all "model" packages
- Updated dependencies [4812a12]
  - @milaboratories/pl-model-common@1.11.3

## 1.24.9

### Patch Changes

- 5f0fb1d: [sdk/ui-vue] PlAgDataTable hidden columns are shown as visible after selecting empty dataset
- Updated dependencies [5f0fb1d]
  - @milaboratories/pl-model-common@1.11.2

## 1.24.5

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
  - @milaboratories/pl-model-common@1.11.1

## 1.24.0

### Minor Changes

- b084260: Rename getAnchoredOptions to getCanonicalOptions that now returns branded options.

### Patch Changes

- Updated dependencies [b084260]
  - @milaboratories/pl-model-common@1.11.1

## 1.23.4

### Patch Changes

- 133e962: add difference to labels with different domains

## 1.23.0

### Minor Changes

- 1016b99: Introduced AnchoredIds and generateAnchoredColumnOptions utility method

### Patch Changes

- Updated dependencies [1016b99]
  - @milaboratories/pl-model-common@1.11.0

## 1.22.97

### Patch Changes

- 63c66c8: update createPFrameForGraphs

## 1.22.59

### Patch Changes

- Updated dependencies [819c13c]
  - @milaboratories/pl-model-common@1.10.6

## 1.22.18

### Patch Changes

- 388c9d2: add getProgressLogWithInfo to log driver
- Updated dependencies [388c9d2]
  - @milaboratories/pl-model-common@1.10.5

## 1.22.2

### Patch Changes

- ce558f9: add blob to url driver that decompress the folder and returns url to the blob
- b41709a: new driver: blob to url that unarchive things
- Updated dependencies [ce558f9]
- Updated dependencies [b41709a]
  - @milaboratories/pl-model-common@1.10.4

## 1.22.0

### Minor Changes

- c0d5856: Model lambda ctx now have activeArgs field, that can be used to retrieve arguments with which block was executed.

## 1.21.20

### Patch Changes

- Updated dependencies [32966e6]
  - @milaboratories/pl-model-common@1.10.3

## 1.21.10

### Patch Changes

- 9d8f87b: add createPFrameForGraphs

## 1.21.0

### Minor Changes

- 05c8c1c: Advanced createPlDataTable

## 1.20.27

### Patch Changes

- 079f50e: uiState in model rendering context now has no forced '| undefined' type mixed into user-provided UiState template parameter
- Updated dependencies [079f50e]
  - @milaboratories/pl-model-common@1.10.2

## 1.20.24

### Patch Changes

- 8043f5d: TreeNodeAccessor track resolve path

## 1.20.11

### Patch Changes

- ead0e68: Account for domain when calculating labels in createPlDataTable

## 1.20.6

### Patch Changes

- 8903a30: Dependency upgrade
- Updated dependencies [8903a30]
  - @milaboratories/pl-model-common@1.10.1

## 1.20.0

### Minor Changes

- 1c8631b: - PlAgDataTable: allow multiple columns sharing same heterogeneous axis
  - model: bugfix related to findLabels

## 1.19.0

### Minor Changes

- 4d9885b: pFrameDriver inline columns support

### Patch Changes

- Updated dependencies [4d9885b]
  - @milaboratories/pl-model-common@1.10.0

## 1.18.0

### Patch Changes

- Updated dependencies [6efea3d]
  - @milaboratories/pl-model-common@1.9.0

## 1.17.0

### Minor Changes

- b1a3abc: PlAgDataTable sheet change

## 1.15.4

### Patch Changes

- Updated dependencies [02feb1a]
  - @milaboratories/pl-model-common@1.8.1

## 1.14.1

### Patch Changes

- a886400: PlTableFilters redesign

## 1.14.0

### Patch Changes

- Updated dependencies [dfad2d0]
  - @milaboratories/pl-model-common@1.8.0

## 1.13.15

### Patch Changes

- Updated dependencies [a5100ac]
  - @milaboratories/pl-model-common@1.7.0

## 1.13.5

### Patch Changes

- a071779: Improvement to deriveLabels (now exported) algorithm
- 6208826: Fix for createPlDataTable behaviour if some data is not yet ready.
- Updated dependencies [e0f0eed]
  - @milaboratories/pl-model-common@1.6.4

## 1.13.2

### Patch Changes

- Updated dependencies [6f56890]
  - @milaboratories/pl-model-common@1.6.3

## 1.13.0

### Minor Changes

- 3157ecd: - model: Default join used in `createPlDataTableSheet` is now a full join of data columns plus inner left join of labels
  - model: Added `getPColumnByRef` utility method in the result pool
  - model: Added `findLabels` method to get axis labels as map in the model
  - model: Added utility methods to get PColumn partition axes values in the model
  - ui/PlAgDataTable:
    - removed transitions from style
    - removed unused style.css
    - moved PlDataTableSheet to a model
    - renamed `{value, text}` to `{value, label}` in `PlDataTableSheet` options for consistency with other APIs (braking change)
    - fixed a bug with non-disappearing label column when the corresponding axis is used in the sheets

## 1.12.0

### Minor Changes

- b207f86: - automatic `Option` label derivation logic based on traces (`pl7.app/trace` annotation)

## 1.10.12

### Patch Changes

- ade3acf: PlTableFilters fixes

## 1.10.2

### Patch Changes

- 8187ba2: PlAgDataTable filters implementation

## 1.10.0

### Minor Changes

- b089273: - `resolve` method in tree accessor now assumes input field type by default
  - `parseResourceMap` helper method to parse maps of files or other entities returned from the workflow

## 1.9.0

### Minor Changes

- b04a78a: Major block config structure upgrade, simplifies future structure upgrades.
  New model features:
  - retentive outputs
  - calculated block `title`
  - initial `uiState`
  - new config lambda context methods:
    - `mapFields` and `allFieldsResolved` for tree node accessor
    - native `getDataByRef` and `getSpecByRef`

### Patch Changes

- Updated dependencies [b04a78a]
  - @milaboratories/pl-model-common@1.6.2

## 1.8.19

### Patch Changes

- 8f916f2: Support column show/hide in PlAgDataTable

## 1.8.0

### Minor Changes

- a5af4f2: Added findDataWithCompatibleSpec method for result pool

### Patch Changes

- Updated dependencies [a5af4f2]
  - @milaboratories/pl-model-common@1.6.1

## 1.7.53

### Patch Changes

- Updated dependencies [05751fa]
  - @milaboratories/pl-model-common@1.6.0

## 1.7.20

### Patch Changes

- Updated dependencies [612a9be]
  - @milaboratories/pl-model-common@1.5.2

## 1.7.16

### Patch Changes

- Updated dependencies [8e9424a]
  - @milaboratories/pl-model-common@1.5.1

## 1.7.9

### Patch Changes

- Updated dependencies [9dae9aa]
  - @milaboratories/pl-model-common@1.5.0

## 1.7.0

### Patch Changes

- Updated dependencies [66383b6]
  - @milaboratories/pl-model-common@1.4.0

## 1.6.0

### Patch Changes

- eb079e9: Support heterogeneous axes in PlAgDataTable
- Updated dependencies [eb079e9]
  - @milaboratories/pl-model-common@1.3.15

## 1.5.40

### Patch Changes

- 13013ee: PlAdDataTable auto-join label-columns
- Updated dependencies [13013ee]
  - @milaboratories/pl-model-common@1.3.14

## 1.2.32

### Patch Changes

- 892ef23: Fix bug with ref equals in resultPool.getSpecByRef

## 1.2.31

### Patch Changes

- 7812ae6: Improve result pool API

## 1.2.30

### Patch Changes

- 3c85025: getRawPlatformaInstance

## 1.2.29

### Patch Changes

- 164fc89: getEnvironmentValue for UI SDK

## 1.2.28

### Patch Changes

- 838493b: PlAgDataTable: fixed state type, display label-columns in place of labeled axes

## 1.2.27

### Patch Changes

- fa6d0f2: V2 Registry API
- 5eb6127: Default to 'Heavy' block type in BlockModel.create()
- 5f95b40: This fixes #29

## 1.2.26

### Patch Changes

- Updated dependencies [6d4cf3e]
  - @milaboratories/pl-model-common@1.3.13

## 1.2.25

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig
- Updated dependencies [da1e029]
  - @milaboratories/pl-model-common@1.3.12

## 1.2.24

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json
- Updated dependencies [0f3f25f]
  - @milaboratories/pl-model-common@1.3.11

## 1.2.23

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
- Updated dependencies [244e3dc]
  - @milaboratories/pl-model-common@1.3.10
