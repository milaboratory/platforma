# @platforma-sdk/workflow-tengo-tests

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
