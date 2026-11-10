# @milaboratories/columns-collection-driver

## 0.2.15

### Patch Changes

- Updated dependencies [9aea514]
  - @milaboratories/pl-model-common@1.55.2

## 0.2.14

### Patch Changes

- b278e85: Build on windows, iter 1. Technical release
- Updated dependencies [b278e85]
  - @milaboratories/pl-model-common@1.55.1
  - @milaboratories/helpers@1.14.7

## 0.2.13

### Patch Changes

- Updated dependencies [9901322]
- Updated dependencies [8d28bcd]
  - @milaboratories/pl-model-common@1.55.0

## 0.2.12

### Patch Changes

- 9cff344: `ColumnsCollection` holds columns only: its driver lists an id only once it has read a column spec for it, so it skips ids whose spec is not readable in the current render and exports that are not columns, such as the `kind: "File"` library of MiXCR Clonotyping. `AccessorColumnsProvider`, `ResultPoolColumnsProvider` and `buildDatasetOptions` skip them too. For such an export, `Column(id)`, `DataColumn.fromId`, `DataColumn.fromPlRef` and `DataColumn.fromAccessor` throw `ColumnAbsentError`; the status getters still report `present`, since status tells only whether the spec is readable. The driver ships with the desktop app; the rest reaches a block when it is rebuilt with this SDK. `ColumnsCollectionDriverHost.resolveSpec` now returns any `PObjectSpec`, and `ColumnsCollectionDriver.isEmpty` takes the host.
- Updated dependencies [9cff344]
  - @milaboratories/pl-model-common@1.54.2

## 0.2.11

### Patch Changes

- Updated dependencies [4cc1e4e]
  - @milaboratories/helpers@1.14.6
  - @milaboratories/pl-model-common@1.54.1

## 0.2.10

### Patch Changes

- Updated dependencies [bb4e8d4]
  - @milaboratories/pl-model-common@1.54.0

## 0.2.9

### Patch Changes

- Updated dependencies [de59755]
  - @milaboratories/pl-model-common@1.53.0

## 0.2.8

### Patch Changes

- Updated dependencies [f4567dd]
  - @milaboratories/pl-model-common@1.52.0

## 0.2.7

### Patch Changes

- Updated dependencies [cadf144]
  - @milaboratories/pl-model-common@1.51.0

## 0.2.6

### Patch Changes

- Updated dependencies [3716dcb]
  - @milaboratories/pl-model-common@1.50.0

## 0.2.5

### Patch Changes

- Updated dependencies [e8f26d6]
  - @milaboratories/pl-model-common@1.49.0

## 0.2.4

### Patch Changes

- Updated dependencies [80a9963]
  - @milaboratories/pl-model-common@1.48.0
  - @milaboratories/helpers@1.14.5

## 0.2.3

### Patch Changes

- Updated dependencies [4ac0df5]
  - @milaboratories/pl-model-common@1.47.3

## 0.2.2

### Patch Changes

- 27600c3: Escape including label columns for non primary columns
- Updated dependencies [27600c3]
  - @milaboratories/pl-model-common@1.47.2
  - @milaboratories/helpers@1.14.5

## 0.2.1

### Patch Changes

- Updated dependencies [3314d0c]
  - @milaboratories/helpers@1.14.4
  - @milaboratories/pl-model-common@1.47.1

## 0.2.0

### Minor Changes

- 881d6ba: ColumnLazy / ColumnsCollection API that bring new way to work with columns in model part

### Patch Changes

- Updated dependencies [881d6ba]
  - @milaboratories/pl-model-common@1.47.0
