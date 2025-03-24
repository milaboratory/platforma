# @platforma-sdk/workflow-tengo-tests

## 1.6.8

### Patch Changes

- Updated dependencies [7034617]
  - @platforma-sdk/workflow-tengo@3.0.0

## 1.6.7

### Patch Changes

- c1c0b8a: Migration to new tengo-builder, dependency fixes.

## 1.6.6

### Patch Changes

- Updated dependencies [af43efe]
  - @platforma-sdk/workflow-tengo@2.16.1

## 1.6.5

### Patch Changes

- 755f6f2: mnz: multiple run specs in dry-run

## 1.6.4

### Patch Changes

- 2dee61b: Monetization Component Demo
- 36e4ae8: Monetization demo part 1

## 1.6.3

### Patch Changes

- 21465ea: mnz: fixes pre-run

## 1.6.2

### Patch Changes

- 990841d: monetization fixes

## 1.6.1

### Patch Changes

- 4dc7670: make pre-run monetization deduplicatable, but it depends on client's date

## 1.6.0

### Minor Changes

- 819c13c: Added high level PColumn mapping and aggregation API to simplify data transformation workflows:
  - New functions for mapping and aggregating PColumn data
  - Takes care of all column spec transformations and validation
  - Integration with CSV/TSV import/export functionality
  - Improved type safety and validation for column specifications

## 1.5.0

### Minor Changes

- 205c17e: Added ability to filter only specific partitions on xsv export with `{partitions: {idx: [keys]}}` option.

## 1.4.3

### Patch Changes

- fd653da: Run tests in parallel (max 3 files at a time)

## 1.4.2

### Patch Changes

- 762425d: wf: exec: add new `argWithVar`, envWithVar, changing old broke forward compat

## 1.4.1

### Patch Changes

- ca3e9fa: wf: exec: add monetization

## 1.4.0

### Minor Changes

- b846960: - Support p-frames export to XSV
  - (breaking) Moved `pColumnResourceMapDataBuilder` from pframes index lib to `pframes.pcolumn` lib

## 1.3.0

### Minor Changes

- d49c764: Support static asset packages in execution pipelines

## 1.2.7

### Patch Changes

- fa6d0f2: V2 Registry API

## 1.2.6

### Patch Changes

- fcbc2df: fixes for proper bundling and require/import compatibility
- 41b10cd: another set of fixes for ESM / CJS compatibility

## 1.2.5

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig
