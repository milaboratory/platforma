# @platforma-sdk/model

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
