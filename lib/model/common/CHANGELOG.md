# @milaboratories/pl-model-common

## 1.13.2

### Patch Changes

- 962c620: Full migration to PFrames Rust

## 1.13.1

### Patch Changes

- 2fc07ba: Fix NaN check for PValue float types

## 1.13.0

### Minor Changes

- 7c52bb5: DataInfo types moved to common type from Internal API to allow explicit construction of PColumn data from within the block's model

## 1.12.0

### Minor Changes

- 88cebeb: Anchored Column Id / Selector API; (S)UniversalColumnId

## 1.11.4

### Patch Changes

- 9e9a70f: Configure eslint to all "node" packages

## 1.11.3

### Patch Changes

- 4812a12: apply eslint rules to the all "model" packages

## 1.11.2

### Patch Changes

- 5f0fb1d: [sdk/ui-vue] PlAgDataTable hidden columns are shown as visible after selecting empty dataset

## 1.11.1

### Patch Changes

- b084260: Branded CanonicalPColumnId type

## 1.11.0

### Minor Changes

- 1016b99: Added APColumnSelector, PColumnSelector and APColumnId interfaces for column selection and AnchorIdDeriver class

## 1.10.6

### Patch Changes

- 819c13c: PColumnSpec.valueType extended to "ValueType | string"

## 1.10.5

### Patch Changes

- 388c9d2: add getProgressLogWithInfo to log driver

## 1.10.4

### Patch Changes

- ce558f9: add blob to url driver that decompress the folder and returns url to the blob
- b41709a: new driver: blob to url that unarchive things

## 1.10.3

### Patch Changes

- 32966e6: [desktop] Custom design for “+ add graph“ etc. sections

## 1.10.2

### Patch Changes

- 079f50e: PlId type moved to SDK model

## 1.10.1

### Patch Changes

- 8903a30: Dependency upgrade

## 1.10.0

### Minor Changes

- 4d9885b: pFrameDriver inline columns support

## 1.9.0

### Minor Changes

- 6efea3d: PlAgDataTable unified data format

## 1.8.1

### Patch Changes

- 02feb1a: Many utility functions for convertion, serialization and deserialization of PValues

## 1.8.0

### Minor Changes

- dfad2d0: PFrames case insensitive filters

## 1.7.0

### Minor Changes

- a5100ac: PFrames case insensitive filters

## 1.6.4

### Patch Changes

- e0f0eed: Ref -> PlRef

## 1.6.3

### Patch Changes

- 6f56890: getFileNameFromHandle method added

## 1.6.2

### Patch Changes

- b04a78a: Minor improvements for mapPObjectData typing

## 1.6.1

### Patch Changes

- a5af4f2: Added findDataWithCompatibleSpec method for result pool

## 1.6.0

### Minor Changes

- 05751fa: Method fileToImportHandle added to LS driver API

## 1.5.2

### Patch Changes

- 612a9be: fix for isPColumnSpecResult type guard

## 1.5.1

### Patch Changes

- 8e9424a: isPColumnSpecResult / isPColumnResult / isLiveLog type guards

## 1.5.0

### Minor Changes

- 9dae9aa: removed isInitialPathHome flag

## 1.4.0

### Minor Changes

- 66383b6: New public API in LS driver: showOpenSingleFileDialog, showOpenMultipleFilesDialog, getLocalFileSize, getLocalFileContent

## 1.3.15

### Patch Changes

- eb079e9: Support heterogeneous axes in PlAgDataTable

## 1.3.14

### Patch Changes

- 13013ee: PlAdDataTable auto-join label-columns

## 1.3.13

### Patch Changes

- 6d4cf3e: migrate away from unique-symbol based branding to branding with string field names

## 1.3.12

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig

## 1.3.11

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json

## 1.3.10

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
