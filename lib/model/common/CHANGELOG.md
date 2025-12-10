# @milaboratories/pl-model-common

## 1.21.10

### Patch Changes

- 5deb79a: add linkers to column_collection

## 1.21.9

### Patch Changes

- bf6fe49: Update advanced filters and types

## 1.21.8

### Patch Changes

- 2c07d5a: Return null instead of error when column not found

## 1.21.7

### Patch Changes

- d088e83: add pl-advanced-filter

## 1.21.6

### Patch Changes

- 17e5fe7: Get rid of circular reference

## 1.21.5

### Patch Changes

- 55b218b: PFrameDriver decomposed

## 1.21.4

### Patch Changes

- 38da155: PlBtnExportArchive added

## 1.21.3

### Patch Changes

- bb07805: xsv.exportFrame migration to ptabler

## 1.21.2

### Patch Changes

- d5a8713: Lint/type fix

## 1.21.1

### Patch Changes

- e8adc3b: Fix Unmatched condition error, disappeared blocks

## 1.21.0

### Minor Changes

- ef22c49: Moved HTTP Authorization header parser/serializer from helpers to pl-model-common

### Patch Changes

- 5ecb368: lint fix

## 1.20.1

### Patch Changes

- 5d4774c: add annotations

## 1.20.0

### Minor Changes

- 916de57: node version bump

## 1.19.19

### Patch Changes

- 662eee0: PFrames - spec update to support artificialColumn join entry

## 1.19.18

### Patch Changes

- 49160c4: Revert BlobDriver interface

## 1.19.17

### Patch Changes

- 6bc20d1: add hidden for graphs columns

## 1.19.16

### Patch Changes

- 3d9638e: PFramesDriver run HTTP parquet server

## 1.19.15

### Patch Changes

- Updated dependencies [0ff2a1b]
  - @milaboratories/pl-error-like@1.12.5

## 1.19.14

### Patch Changes

- 2a21be5: Added `pl7.app/description` to well-known annotations list

## 1.19.13

### Patch Changes

- c792469: Set type to module for packages used by PFrames

## 1.19.12

### Patch Changes

- 2589dec: Export Branded type from model-common

## 1.19.11

### Patch Changes

- b14b2fb: update dist builder
- Updated dependencies [b14b2fb]
  - @milaboratories/pl-error-like@1.12.4

## 1.19.10

### Patch Changes

- e3e69bd: fix axes normalizaion

## 1.19.9

### Patch Changes

- 6b9828a: Remove unused styles, fix lint warnings, update comments

## 1.19.8

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/pl-error-like@1.12.3

## 1.19.7

### Patch Changes

- 078efc1: fix for linker columns

## 1.19.6

### Patch Changes

- 4468f99: add composite linker columns

## 1.19.5

### Patch Changes

- 4b67e4f: PFrames driver - integrated parquet data info handling

## 1.19.4

### Patch Changes

- b8105fb: PFrames - Different public and internal types for ParquetDataInfo

## 1.19.3

### Patch Changes

- 6d6c4ba: Updated ParquetPartitionedDataInfo specification

## 1.19.2

### Patch Changes

- 017a888: ParquetPartitionedDataInfo specification

## 1.19.1

### Patch Changes

- 636088d: Removed PValue type everywhere, use PTableValue for UI operations instead
- 636088d: PFrames - update PTableVector format

## 1.19.0

### Minor Changes

- 98b0ded: drivers: frontend: replace path with url with custom protocol and signature

## 1.18.0

### Minor Changes

- 3271446: MSA: added export functionality

## 1.17.0

### Minor Changes

- e7c0edb: Platforma API v2 (long pooling) + support v1 api in sdk

## 1.16.5

### Patch Changes

- 9bb26ff: PlAgDataTableV2 - linker columns handling fix

## 1.16.4

### Patch Changes

- c12345a: createPFrameForGraphs update

## 1.16.3

### Patch Changes

- 7be8a2b: Adopt PFrameError

## 1.16.2

### Patch Changes

- dfb0086: Intruduced PFrameError

## 1.16.1

### Patch Changes

- d525c60: PFrames - support InSet filter

## 1.16.0

### Minor Changes

- 3b46d33: Refactored block configuration model and introduced a feature flag system. This provides a more robust way to manage different block config versions and check for feature compatibility.

## 1.15.9

### Patch Changes

- bd788f9: PFrames driver - accept partitionFilters separately from all other fields

## 1.15.8

### Patch Changes

- 8236387: Grouping in PlDropdown

## 1.15.7

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/pl-error-like@1.12.2

## 1.15.6

### Patch Changes

- 6ffe944: PlAgDataTableV2 refactoring
- 6ffe944: PlAgDataTable types fixed

## 1.15.5

### Patch Changes

- 49cf7ee: Standard Error serialization/deserialization

## 1.15.4

### Patch Changes

- 61aa680: Bug cutting empty domain{} from spec fixed

## 1.15.3

### Patch Changes

- f191f2a: drivers: download: add sparse cache for ranges

## 1.15.2

### Patch Changes

- 1cbbd66: PFrame driver - accept range in calculateTableData

## 1.15.1

### Patch Changes

- 89fd5d3: drivers: download: implement definitions in middle layer
- 7878cb5: drivers: download: add range

## 1.15.0

### Minor Changes

- b0b80af: - fix for label derivation with enough diversity solaly in labels
  - fallback behaviour for derive labels function
  - deduplication of columns in column collection

## 1.14.1

### Patch Changes

- 94468e0: PFrames version bump

## 1.14.0

### Minor Changes

- 01a558e: Explicit enrichment tracking in model and refs:
  - requireEnrichments flag added to PlRef
  - enriches lambda added to model builder
  - ctx.getOptions(...) now allows to create options with references requiring enrichments
  - helper methods to create PlRef's and to manipulate requireEnrichments flag

## 1.13.8

### Patch Changes

- Updated dependencies [141aebc]
  - @milaboratories/pl-error-like@1.12.1

## 1.13.7

### Patch Changes

- f9bc9a8: Add Json branded by stringified type

## 1.13.6

### Patch Changes

- 621e15a: PlAgDataTableV2 component (does not include hidden columns in join)

## 1.13.5

### Patch Changes

- 21233c2: - Reverted wrong annotations field in anchored bquery schema (#722)
  - Fixed pColumn bundle.xsvTableBuilder for work with long file names
  - Fixed anchored axis spec in canonicalOptions
  - Allow optional domains in canonicalOptions
  - Removed do-pack from tests

## 1.13.4

### Patch Changes

- 43e1c65: AnchorColumns API refactoring

## 1.13.3

### Patch Changes

- Updated dependencies [ff0f92c]
  - @milaboratories/pl-error-like@1.12.0

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
