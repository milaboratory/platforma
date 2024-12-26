# @platforma-sdk/workflow-tengo

## 2.9.6

### Patch Changes

- f129da8: PFrames update

## 2.9.5

### Patch Changes

- 5067916: Correct path to R local packages index

## 2.9.4

### Patch Changes

- be4e18a: Enable R to run in restricted network on linux and mac

## 2.9.3

### Patch Changes

- 762425d: wf: exec: add new `argWithVar`, envWithVar, changing old broke forward compat

## 2.9.2

### Patch Changes

- 9be2ff2: wf: exec: revert old arg behaviour for expressions

## 2.9.1

### Patch Changes

- d6f8a4c: PFrames update

## 2.9.0

### Minor Changes

- 4fc63d8: breaking change: package builder: cmd -> command; workflow-tengo: exec expressionRefs

## 2.8.8

### Patch Changes

- 3e516a3: maps.clone utility method with removeUndefs option

## 2.8.7

### Patch Changes

- ca3e9fa: wf: exec: add monetization

## 2.8.6

### Patch Changes

- 079f50e: Fix for SmartResource.getError() method

## 2.8.5

### Patch Changes

- f2899c9: Fix line numbering

## 2.8.4

### Patch Changes

- 345d088: Set RHOME for Rscript correct execution

## 2.8.3

### Patch Changes

- 0be0012: Move rest of the scripts to 'scripts' dir

## 2.8.2

### Patch Changes

- f2f1d12: Drop unused imports

## 2.8.1

### Patch Changes

- 7734966: Safer migration errors for unmarshalled bquery results

## 2.8.0

### Minor Changes

- 9405947: Allow local python packages install using index embedded into python run environment

## 2.7.0

### Minor Changes

- 2f3f37f: BQuery result unmarshaller enabled for all templates, not only workflows

## 2.6.0

### Minor Changes

- 885c08b: R language support!

## 2.5.0

### Minor Changes

- dfad2d0: PFrames case insensitive filters

## 2.4.1

### Patch Changes

- ea8761e: Make smart fields and resources to automatically choose the best possible type of future field getter (ephemeral or not)

## 2.4.0

### Minor Changes

- e56a9be: Library for tengo unit tests

## 2.3.1

### Patch Changes

- 3adf776: Bugfixes with csv export

## 2.3.0

### Minor Changes

- c05f946: - fixes exec template hash
  - adds maps.merge and maps.deepMerge utility methods

### Patch Changes

- ebad1d5: - major bug fix in validation library
  - PFrame trace annotation helper

## 2.2.1

### Patch Changes

- 1c6e7aa: pfconv support skipping comments and empty lines

## 2.2.0

### Minor Changes

- 7d52fca: Add cache control to smart.field and assts in commands

## 2.1.0

### Minor Changes

- 7ccecce: p-frames.xsv: ability to export list of p-columns

## 2.0.1

### Patch Changes

- 55d1125: Fix for missing naRegex fields in pfconv input file

## 2.0.0

### Major Changes

- 10e3c83: pfconv importCsv API changed

## 1.8.1

### Patch Changes

- 2643471: fix cache for render

## 1.8.0

### Minor Changes

- b846960: - Support p-frames export to XSV
  - (breaking) Moved `pColumnResourceMapDataBuilder` from pframes index lib to `pframes.pcolumn` lib

## 1.7.6

### Patch Changes

- a5af4f2: Added findDataWithCompatibleSpec method for result pool

## 1.7.5

### Patch Changes

- 83b50e0: Fix for missing allowNA fields in pfconv input file

## 1.7.4

### Patch Changes

- 554e5d3: PFrames version bump

## 1.7.3

### Patch Changes

- 68de5a5: pfconv version bump

## 1.7.2

### Patch Changes

- 50f7459: Dep upgrade, vitest in particular

## 1.7.1

### Patch Changes

- 681efa7: pfconv version bump

## 1.7.0

### Minor Changes

- d49c764: Support static asset packages in execution pipelines

## 1.6.4

### Patch Changes

- 612a9be: Option splitDataAndSpec for xsv.importFile

## 1.6.3

### Patch Changes

- ddb92ea: exec: rename cache -> cacheMillis, cacheMinutes, cacheSeconds etc; deprecate .cache()

## 1.6.2

### Patch Changes

- ef02b23: PFrames conversion spec update

## 1.6.1

### Patch Changes

- f5fc8ab: workdir: fix paths

## 1.6.0

### Minor Changes

- e70b473: Add python language support

## 1.5.0

### Minor Changes

- 0b6fac6: Support table transposition in xsv.import

## 1.4.2

### Patch Changes

- 4e5c436: Use strict maps in exec inputs

## 1.4.1

### Patch Changes

- ba7fd8a: Pass secrets to running command
- 37e5128: Solve deduplication issues with pure future field getter

## 1.4.0

### Minor Changes

- 4982844: Use light queue for pfconv.

## 1.3.0

### Minor Changes

- 76f51e5: More execution queues available (heavy, medium, light, ui-tasks)

## 1.2.11

### Patch Changes

- d5ef69e: added printErrStreamToStdout() to pfconv execution to see a better error message

## 1.2.10

### Patch Changes

- 15a545d: fix for copyOptional=true and absent file extension

## 1.2.9

### Patch Changes

- 8e9727f: added support for pl secrets API

## 1.2.8

### Patch Changes

- fcbc2df: fixes for proper bundling and require/import compatibility
- 41b10cd: another set of fixes for ESM / CJS compatibility

## 1.2.7

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig

## 1.2.6

### Patch Changes

- bb145f7: pfconv pre-preocess support

## 1.2.5

### Patch Changes

- 5e9a36c: fixes export-pframe behaviour for spec-only columns
