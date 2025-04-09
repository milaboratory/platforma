# @platforma-sdk/workflow-tengo-tests

## 1.7.5

### Patch Changes

- Updated dependencies [c021ce8]
  - @platforma-sdk/workflow-tengo@4.0.3

## 1.7.4

### Patch Changes

- Updated dependencies [43e1c65]
  - @platforma-sdk/workflow-tengo@4.0.2

## 1.7.3

### Patch Changes

- Updated dependencies [1564354]
  - @platforma-sdk/workflow-tengo@4.0.1

## 1.7.2

### Patch Changes

- Updated dependencies [8b4a614]
  - @platforma-sdk/workflow-tengo@4.0.0

## 1.7.1

### Patch Changes

- Updated dependencies [68809d4]
  - @platforma-sdk/workflow-tengo@3.3.0

## 1.7.0

### Minor Changes

- ff0f92c: Breaking Changes:
  type `ValueOrErrors` now has `ErrorLike` errors instead of `string` errors.
  Several places that handles errors from block outputs, fields (when we use `resolve` in model), or in the result pool could be broken.

  Migration steps:

  - if your model handles errors (e.g. via try/catch) in the result pool, in outputs or in `resolve`, then your block will stop compiling. The type of errors was changed from `string` to `ErrorLike`, to get the error as string, get `.message` or `.fullMessage` attribute on the new error.

## 1.6.15

### Patch Changes

- Updated dependencies [d8a33ab]
  - @platforma-sdk/workflow-tengo@3.2.1

## 1.6.14

### Patch Changes

- cd57569: Support new CPU/RAM limitation feature for commands
- Updated dependencies [cd57569]
  - @platforma-sdk/workflow-tengo@3.2.0

## 1.6.13

### Patch Changes

- Updated dependencies [f0f6a8b]
- Updated dependencies [88cebeb]
  - @platforma-sdk/workflow-tengo@3.1.0

## 1.6.12

### Patch Changes

- 4812a12: apply eslint rules to the all "model" packages
  - @platforma-sdk/workflow-tengo@3.0.3

## 1.6.11

### Patch Changes

- Updated dependencies [4a604e7]
  - @platforma-sdk/workflow-tengo@3.0.3

## 1.6.10

### Patch Changes

- 4b04041: skip exporting files when we have a certain annotation from UI for pframes.
- Updated dependencies [4b04041]
  - @platforma-sdk/workflow-tengo@3.0.2

## 1.6.9

### Patch Changes

- Updated dependencies [fb5a9ff]
  - @platforma-sdk/workflow-tengo@3.0.1

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
