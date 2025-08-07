# @platforma-sdk/workflow-tengo

## 5.0.2

### Patch Changes

- 3f93434: Packages configuration normalization

## 5.0.1

### Patch Changes

- 2c0d624: Ensure pip installs Python dependencies from local sources only by adding the `--no-index` flag. This prevents any attempts to connect to the public PyPI repository, making dependency installation more secure and reliable in isolated environments.
- 3da120c: Attach fake software descriptor to packag get requests to support packages without .sw.json inside

## 5.0.0

### Major Changes

- 1831f6d: Add `ll.getBlobSize` function to retrieve blob size.

## 4.18.2

### Patch Changes

- d1b00dc: Added expression-based argument and environment variable methods to exec builder with comprehensive documentation of available system variables (cpu, memory, secrets, env). Added argExpr() and envExpr() methods, deprecated argWithVar() and envWithVar(). Updated pt library to pass allocated CPUs to polars-based-ptabler.

## 4.18.1

### Patch Changes

- a716ccd: Fix fill null behaviour to fill null and added fill NaN to fill NaNs
- Updated dependencies [a716ccd]
  - @platforma-open/milaboratories.software-ptabler@1.11.2

## 4.18.0

### Minor Changes

- d407d12: installing cursor extension during ctag building

## 4.17.1

### Patch Changes

- bcde71e: Now uses ptabler form workspace
- Updated dependencies [bcde71e]
  - @platforma-open/milaboratories.software-ptabler@1.11.1

## 4.17.0

### Minor Changes

- b74b887: Enhanced structField expression API with native array path support and advanced options

  - Replace varargs field chaining with native array-based field paths: `structField(["coordinates", "lat"])`
  - Add optional `default` parameter for fallback values when fields are missing
  - Add optional `dtype` parameter for automatic type casting of extracted values
  - Maintain backward compatibility with single field string access
  - Improve performance by using native recursive field access instead of expression chaining

## 4.16.0

### Minor Changes

- 4ca3d94: - Fixed data parsing logic for `RTYPE_P_COLUMN_DATA_RESOURCE_MAP_PARTITIONED` by correctly handling both `partitionKeyLength` and `keyLength` properties
  - Fixed incorrect resource type reference in `flatten` method for resource map partitioned data
  - Added `treeJoin` function to pt module for joining multiple DataFrames in a tree-like pattern using recursive pairwise joins
  - Added `flatten` function to slices module for flattening nested arrays with support for both shallow and deep flattening modes
  - Added comprehensive JSDoc-style documentation to all PColumnData methods including parameter descriptions, return types, and usage examples
  - Added `structField` method to expression API for accessing nested data structures with support for single field extraction and nested path resolution using varargs (e.g., `col("location").structField("coordinates", "lat")`)
    - Implements robust error handling using `map_elements` with Python's dict `.get()` method for graceful handling of both null structs and missing fields
    - Supports deeply nested field access with automatic null propagation when intermediate structures are missing
    - Compatible with JSON import workflows where nested structures may have inconsistent schemas across records

## 4.15.0

### Minor Changes

- 7cc3e1c: Add NDJSON support to pt (PTabler) API

  Introduces NDJSON (Newline Delimited JSON) reading and writing support alongside existing CSV/TSV functionality.

  **New Features:**

  - `format` parameter in `wf.frame()` supporting "csv", "tsv", "ndjson"
  - Auto-detection from file extensions (.csv, .tsv, .ndjson, .jsonl)
  - Enhanced reading with `nRows` and `ignoreErrors` parameters
  - NDJSON writing with auto-detection and explicit format override
  - Full backward compatibility with existing `xsvType` parameter

  **Usage:**

  ```javascript
  // Reading NDJSON
  wf.frame(content, { format: 'ndjson', nRows: 100 });

  // Writing NDJSON
  df.save('output.jsonl');
  df.save('data.txt', { format: 'ndjson' });
  ```

## 4.14.1

### Patch Changes

- 7d7dedd: - Fixes for parseToJson logic, so that it supports raw output of getFileContent
  - Additional check in anonymization logic

## 4.14.0

### Minor Changes

- 0256548: Add support for new column kinds in TsvContent settings and PColumnData/Json processing

  **New Column Kinds:**

  - `kind: "line"` - Exports raw TSV line content as String PColumn
  - `kind: "json-line"` - Exports JSON-encoded line content as String PColumn with configurable field mapping
  - `kind: "column"` - Explicit version of existing behavior (backward compatible)

  **New parseToJson Function:**

  - **Direct TSV Parsing**: Added `pframes.parseToJson(targetContent, params)` function as a simplified wrapper around the parse-to-json template
  - **Flexible Input Support**: Accepts string content, resource references, or `{data: resourceMapRef, spec: PColumnSpec}` format
  - **TsvContent Settings**: Uses the same `TSV_CONTENT_SETTINGS_SCHEMA` format as `processColumn` for consistency
  - **All Column Kinds**: Full support for `column`, `line`, and `json-line` parsing modes
  - **Smart Object Interface**: Returns object with methods:
    - `output(columnId)` - Returns `{data: Resource, spec: PColumnSpec}`
    - `outputData(columnId)` - Returns data resource only
    - `outputSpec(columnId)` - Returns column spec only
    - `listOutputs()` - Returns array of column IDs
    - `addAllOutputsToBuilder(builder)` - Adds all outputs to pframe builder
  - **Pure Template Rendering**: Uses `render.create()` for better caching and deduplication
  - **Axes Composition**: Automatically combines base axes (from input spec) with settings axes for output specifications

  **PColumnData/Json Support:**

  - **New Resource Type Support**: Added full support for `PColumnData/Json` in `processColumn` function
  - **Embedded Data Processing**: Supports primitive data embedded directly in resource metadata (unlike partitioned types that reference external resources)
  - **Dual Mode Operation**:
    - **Mapping Mode**: Processes individual primitive values directly through automatic unmarshalling
    - **Aggregation Mode**: Groups embedded data and creates intermediate `PColumnData/Json` resources for body template processing
  - **Type Detection**: Added proper resource type detection and validation for `PColumnData/Json`
  - **Metadata Extraction**: Handles `keyLength` and embedded `data` fields from resource metadata
  - **Anonymization Restriction**: Prevents anonymization with `PColumnData/Json` (only supported for resource-based types)

  **Code Improvements:**

  - **Helper Functions**: Extracted common code into reusable helper functions:
    - `getTsvColumnId()` - Column ID extraction with backward compatibility
    - `transformTsvSettings()` - Settings transformation for parse template format
  - **Path Resolution**: Updated to use `renderResult.resolveOutput(["result", columnId])` instead of string concatenation
  - **Documentation**: Added comprehensive documentation matching `processColumn` style with detailed column kind explanations

  **Features:**

  - **Backward Compatibility**: Existing TsvContent configurations without `kind` field continue to work unchanged
  - **Schema Validation**: Added closed validation schemas with proper type enforcement
  - **String Type Enforcement**: `line` and `json-line` kinds are validated to only accept `String` valueType in specs
  - **JSON Field Mapping**: `json-line` supports custom field IDs for JSON property names via nested `columns` array

  **Breaking Changes:** None - fully backward compatible

  **Migration:** No migration required. Existing code continues to work. New `kind` field is optional and defaults to `"column"` behavior.

## 4.13.0

### Minor Changes

- 8ffee22: Added new TsvContent output type and enhanced trace injection:

  **New TsvContent Output Type:**

  - Added `TsvContent` output type to `processColumn()` function for parsing TSV content to JSON PColumn data
  - Simplified settings schema with `axes` and `columns` arrays containing `column` name and `spec` objects
  - Automatic transformation from user settings to parse template format
  - Integration with `parse-to-json.tpl.tengo` template for efficient TSV parsing
  - Similar to Xsv but simpler: no partitioning, single parse call, direct JSON output
  - Updated all output methods (`outputSpec`, `outputData`, `output`, etc.) to support TsvContent
  - Added comprehensive validation using validation library with `TSV_CONTENT_SETTINGS_SCHEMA`

  **Enhanced Trace Injection:**

  - Added `override` option to `makeTrace().inject()` function with default value of `true`
  - Added `overrideTrace` flag to `processColumn()` function with smart defaults:
    - Defaults to `true` when `traceSteps` is provided (override existing traces with new steps)
    - Defaults to `false` when no `traceSteps` are provided (preserve existing traces)
  - Updated all trace injection calls in `processColumn` to respect the override setting

  **Per-Output Trace Support:**

  - Added per-output `traceSteps` and `overrideTrace` fields to all output types
  - Output-specific `traceSteps` are appended after global `traceSteps` (global first, then output-specific)
  - Each output can override the global `overrideTrace` setting independently
  - Smart defaults for `overrideTrace`: defaults to `true` when any traceSteps (global or per-output) are provided
  - Used `slices.normalize()` for safe array concatenation regardless of undefined values
  - Cleaned up trace handling code by removing uninformative comments

  **Code Quality Improvements:**

  - Replaced manual validation checks with `validation.assertType()` for better error messages
  - Used `slices.map()` for functional array transformations instead of manual loops
  - Applied defensive copying with `copy()` for all array operations to prevent mutations

## 4.12.0

### Minor Changes

- f395ba9: Additional string manipulation functions for pt library:

  - `strContains(pattern, options)` - Check if string contains a pattern (regex or literal mode with strict validation)
  - `strContainsAny(patterns, options)` - Check if string contains any of multiple literal patterns using Aho-Corasick algorithm with optional case-insensitive matching
  - `strCountMatches(pattern, options)` - Count occurrences of a pattern in string (regex or literal mode)
  - `strExtract(pattern, options)` - Extract parts of string using regex patterns with capture group support
  - `strStartsWith(prefix)` - Check if string starts with a literal prefix
  - `strEndsWith(suffix)` - Check if string ends with a literal suffix

  All functions accept both string literals and expression objects as parameters and provide comprehensive options for different matching modes.

## 4.11.0

### Minor Changes

- a6a91a3: - Support for expressions in pt.slice\* functions
  - New pt.replaceAll and pt.substring functions

## 4.10.0

### Minor Changes

- 5d21b36: - Ability to set output cache for pure templates
  - `stepCache` parameter for `processColumn`, to set caching to allow deduplication and recovery logic to pick up previous results in quick recalculation scenarious
  - Anonymization and deanonymization logic for resource fields and PColumnKeys allows deduplication for calculation depending on things like sample ids that are different in different project, yet the data is the same
  - Support of anonymization logic in `processColumns`

## 4.9.3

### Patch Changes

- 9a4b895: improve docs

## 4.9.2

### Patch Changes

- 5e85fea: Final fixes for resource allocation logic

## 4.9.1

### Patch Changes

- 2e3c3ab: - Rename service to meta fields in developer facing API
  - Add metaExtra to process column

## 4.9.0

### Minor Changes

- 964ba27: Fix for software materialization deadlock

## 4.8.1

### Patch Changes

- 1004519: Fixes deadlock in exec between a storage and compute quotas, leading to sporadic freezes of block workflows

## 4.8.0

### Minor Changes

- e18117d: Force quota feature flags to true, added serviceFields feature flag to allow execution on previous platforma version with an issue with service fields

## 4.7.5

### Patch Changes

- 2d2a39d: Fixes cannot get element from strictMap: key "has_suffix" in xsv builder

## 4.7.4

### Patch Changes

- 5ac72c3: Allow to set CPU, Mem and Queue for pfconv jobs in various contexts

## 4.7.3

### Patch Changes

- 2c52dc7: Job scheduling options exposed for pt builde: mem, cpu and queue.

## 4.7.2

### Patch Changes

- 2dad052: tengo API enchancements: more notification filters, hashing functions, execution context, more methods in fields and resources API

## 4.7.1

### Patch Changes

- b1bf419: - significant review of await logic
  - fix via hacky workaround for "Final" resource state await
  - significant optimization of await logic, so it uses less subscriptions
  - resourceDuplicateEvent feat for future backend upgrade
  - createDynamicField method for smart resource

## 4.7.0

### Minor Changes

- 42a9492: Support batch systems execution in workflows

## 4.6.5

### Patch Changes

- daaaf08: Fixes field name type convertion and assertion

## 4.6.4

### Patch Changes

- f8e88c1: Fix for final resource state await logic

## 4.6.3

### Patch Changes

- d8db125: - Fix for PColumn data parsing logic: allow field references as input is parse = false
  - Optimization for processColumn: unwrapping result for empty grouping after aggregation

## 4.6.2

### Patch Changes

- ac02ffd: - Fix for PColumnBundle and PColumnBundleWithPartitions await aliases.
  - Separation of PColumn data parsing logic

## 4.6.1

### Patch Changes

- 0ce0375: PT library fixes:
  - fix for infetSchema parameter in pt.frame()
  - schema now can be set via opts in pt.frame()

## 4.6.0

### Minor Changes

- d40d65e: Refactored XSV table generation and improved column handling in pframe bundles.

  Key changes:

  - Major: Polars-like API to work with tables based on PTabler Python module
  - Decoupled XSV Table Generation:
    - Removed `PColumnBundle.xsvTableBuilder()`.
    - Introduced `pframes.tsvFileBuilder()` and `pframes.csvFileBuilder()` for standalone XSV file creation.
  - Enhanced Column Retrieval:
    - `PColumnBundle.getColumn()` updated for filtered ID support and axis-level data slicing, returning `{ key, spec, data }`.
    - `PColumnBundle.getColumns()` now uses `canonical.encode(r.ref)` for key generation.
  - New Spec Utility:
    - Added `spec.axisSpecToMatcher()` for converting `AxisSpec` to a matcher object.

## 4.5.3

### Patch Changes

- cf508e9: Fix error handling in \_unmarshal function

## 4.5.2

### Patch Changes

- 0f084c1: Pass service inputs to tpl.body() callback

## 4.5.1

### Patch Changes

- 1d20d57: wf: exec: renv: fix missing queue: allocation panicked

## 4.5.0

### Minor Changes

- efd2b56: add local python script to PYTHONPATH

## 4.4.5

### Patch Changes

- 4c9384b: python dependencies don't installed with slow connection

## 4.4.4

### Patch Changes

- 8c4b1ea: revert update pythonpath

## 4.4.3

### Patch Changes

- 3c851df: change pythonpath

## 4.4.2

### Patch Changes

- d531d7d: Make python work on windows 10 without system python installed

## 4.4.1

### Patch Changes

- 3e5845b: Also use dynamic bin dir name when starting python scripts inside venv

## 4.4.0

### Minor Changes

- bump small-binaries
- 3f9187f: getting pyton bin bath related to os

## 4.3.2

### Patch Changes

- 6ab1be8: more check_network checks
- 6ab1be8: updated check network

## 4.3.1

### Patch Changes

- b82d4de: check network: storages check; drivers: download: range query initial

## 4.3.0

### Minor Changes

- 56df55f: Added API to work with bundle.addMulti()

## 4.2.3

### Patch Changes

- 8f9a534: Fix for undefined annotations in anchored query

## 4.2.2

### Patch Changes

- afe3583: - fix for b-query result unmarshaller requiring data to always be available
  - macro state definitions for awaitState API: BQueryResultSingle, BQueryResultMulti, BQueryResultMultiNoData, PColumnBundle, PColumnBundleWithPartitions
  - anchor columns are now available by their ids in column bundle
  - wf.getBlockId() to retrieve string block id

## 4.2.1

### Patch Changes

- 5277219: Deeper network check with templates for downloading and uploading files and running binaries and Python.

## 4.2.0

### Minor Changes

- 60b6702: New methods for workflow template API:
  - explicit availability of parent context via self.getParentBCtx()
  - self.getBlockId() to get block id as string

## 4.1.4

### Patch Changes

- 4ea9a4e: Fix propagation of anchoredQueryOpts

## 4.1.3

### Patch Changes

- 5281304: Fixes export-pframe-for-ui template so it does not wait for data to be materialized in any form, fixes option calculation while upstream blocks are still calculating

## 4.1.2

### Patch Changes

- dfa3dcd: Multiple new features for SDK:
  - support for partitioned data columns in processColumn
  - forEach function in maps library
  - improvement of code reproducibility for better result hash consistency
  - dontSaveStdout, dontSaveStderr, dontSaveStdoutOrStderr for exec library
  - addSingle and addMulti method for column bundle with more homogeneous API
  - support of ignoreMissingDomains for anchored bqueries and column bundle

## 4.1.1

### Patch Changes

- 7cd6249: Rename “Monetization” to “Subscription” and small fixes

## 4.1.0

### Minor Changes

- a34b2ef: update tengo-builder

## 4.0.9

### Patch Changes

- dfa3dcd: forEach function in maps library

## 4.0.8

### Patch Changes

- edc25d1: Empty table fixes:
  - fix for incorrect handling of new empty xsv convert output in processColumn
  - pfconv upgrade fixes error message while handling empty-tables in some situations

## 4.0.7

### Patch Changes

- 21233c2: - Reverted wrong annotations field in anchored bquery schema (#722)
  - Fixed pColumn bundle.xsvTableBuilder for work with long file names
  - Fixed anchored axis spec in canonicalOptions
  - Allow optional domains in canonicalOptions
  - Removed do-pack from tests

## 4.0.6

### Patch Changes

- 204cf5d: PFconv version bump

## 4.0.5

### Patch Changes

- 9c1dc19: fix anchor query scema for axis (allow annotations)

## 4.0.4

### Patch Changes

- 8142f77: Minor error message correction.

## 4.0.3

### Patch Changes

- c021ce8: [mnz] Block Product Status Component

## 4.0.2

### Patch Changes

- 43e1c65: Minor additions to standard library:
  - new strings library
  - getValues for maps lib
    New methods for unmarshalled column bundle:
  - getSpec
    Additional check for xsv-import:
  - Explicit error for incorrect partitioning length

## 4.0.1

### Patch Changes

- 1564354: pframes.exportFrame schema validation

## 4.0.0

### Major Changes

- 8b4a614: Braking change in pframes.exportFrame: column order in result XSV may change

## 3.3.0

### Minor Changes

- 68809d4: Use new 'feature flags' tengo API method to check available backend features

## 3.2.1

### Patch Changes

- d8a33ab: Fix to addById in column bundle

## 3.2.0

### Minor Changes

- cd57569: Support new CPU/RAM limitation feature for commands

## 3.1.0

### Minor Changes

- 88cebeb: Column Batches (builder and unmarshaller); Full support of SUniversalPColumnId (both filtered and vanilla variants)

### Patch Changes

- f0f6a8b: Spec distiller

## 3.0.3

### Patch Changes

- 4a604e7: bump pframes

## 3.0.2

### Patch Changes

- 4b04041: skip exporting files when we have a certain annotation from UI for pframes.

## 3.0.1

### Patch Changes

- fb5a9ff: Refactor regex handling across multiple files to use the new regexp module for improved performance and consistency. This includes pre-compiling regex patterns where applicable.

## 3.0.0

### Major Changes

- 7034617: Breaking Changes:
  - `pframes.exportFrame`: for some inputs order of columns in exported CSV files could change

## 2.16.1

### Patch Changes

- af43efe: Rebuilt with new tengo-builder

## 2.16.0

### Minor Changes

- 1016b99: Added new mechanism for resolving results from pools using anchors and matchers (via anchoredQuery method)

## 2.15.16

### Patch Changes

- 1f60e0f: Fix for error message propagation logic in template

## 2.15.15

### Patch Changes

- a9d38f3: Add deepTransform function for advanced map transformations

## 2.15.14

### Patch Changes

- 14b832c: fix mnz-client in edge cases like empty arg list, empty runs

## 2.15.13

### Patch Changes

- 5828a76: fix mnz-client in edge cases like empty arg list, empty runs

## 2.15.12

### Patch Changes

- 809c8d7: Minor fixes for trace propagation logic:
  - fixes makeTrace with empty array as input for steps
  - enables trace propagation in processColumn even if trace steps are not specified, but input has tracing information

## 2.15.11

### Patch Changes

- 755f6f2: mnz: multiple run specs in dry-run

## 2.15.10

### Patch Changes

- 2dee61b: Monetization Component Demo
- 36e4ae8: Monetization demo part 1

## 2.15.9

### Patch Changes

- eb4aa78: Always override repos list for RENV when running R

## 2.15.8

### Patch Changes

- 21465ea: mnz: fixes pre-run

## 2.15.7

### Patch Changes

- 5bc719a: Force block developer to prepare dependencies on R distro side for early error discovery

## 2.15.6

### Patch Changes

- 3944280: Small-binaries dependency upgrade

## 2.15.5

### Patch Changes

- 990841d: monetization fixes

## 2.15.4

### Patch Changes

- 4dead9e: addXsvOutputToBuilder and addAllOutputsToBuilder methods for processColumn output

## 2.15.3

### Patch Changes

- 4dc7670: make pre-run monetization deduplicatable, but it depends on client's date

## 2.15.2

### Patch Changes

- b86270f: Changed the way how R environments are prepared (more static dependencies)

## 2.15.1

### Patch Changes

- e6ad278: tengo-builder upgrade

## 2.15.0

### Minor Changes

- 2c75b72: # Tools to process PColumns with optionally absent results (sparse results)

  This changeset adds support for handling sparse (nullable or absent) results in the PColumn processing pipeline. Previously, the system required each mapping iteration to return the same set of outputs, but now it can gracefully handle absent values in some iterations.

  ## Key Features

  ### Core Functionality

  - Adds support for sparse results in the `processColumn` function
  - Introduces `RNull` constant and `RTYPE_NULL` resource type for representing absent values
  - Adds `keepNulls` option in path property to preserve null values when desired

  ### New Helper Functions

  - `buildFutureField`: Central helper function with the most comprehensive feature set for optional field resolution
  - `getFutureFieldWithDefault`: Safely accesses fields that may not exist yet or may appear later in workflow
    - Resolves fields from resources that may be created dynamically
    - Provides fallback default values when fields don't exist
  - `optionalOutput` and `resolveOutput`: Manages optional fields in render outputs
  - `awaitStateIfEphemeral`

  ### Testing

  - New test cases for sparse mode with and without aggregation
  - Tests for handling null values in various scenarios

  ### Etc

  - Extensive Tengo language documentation added
  - Workflow template engine support documentation

## 2.14.0

### Minor Changes

- 78ba96c: Add 'waiter' template with common 'Ready' event sync logic

## 2.13.6

### Patch Changes

- e0d8153: PFrames version bump

## 2.13.5

### Patch Changes

- 2b7923e: fix workdirs createDirs

## 2.13.4

### Patch Changes

- ba246f9: Two fixes for processColumn function

  - fixes valudation loginc in processColumn, now data can be a field ref
  - fixes validation in outputData and outputSpec for xsv outputs

## 2.13.3

### Patch Changes

- bb03724: update mnz-client small-binary

## 2.13.2

### Patch Changes

- e9a6ef1: tengo: exec: mnz: add dry-run and n remaining runs

## 2.13.1

### Patch Changes

- cb18f69: Fix the render library implementation in workflow-tengo SDK to properly handle undefined inputs.

## 2.13.0

### Minor Changes

- 819c13c: Added high level PColumn mapping and aggregation API to simplify data transformation workflows:
  - New functions for mapping and aggregating PColumn data
  - Takes care of all column spec transformations and validation
  - Integration with CSV/TSV import/export functionality
  - Improved type safety and validation for column specifications

## 2.12.1

### Patch Changes

- ddced5d: Make R local preparation steps be more informative on error

## 2.12.0

### Minor Changes

- ecd1522: Integrate with workdir limits in data controller

## 2.11.0

### Minor Changes

- 144ed1e: Fix unnecessary prepare in staging wf run

## 2.10.2

### Patch Changes

- 832f3ba: Use validation.assertType instead of assertJsonSchema

## 2.10.1

### Patch Changes

- ccff13a: validation.assert (method rename)

## 2.10.0

### Minor Changes

- 205c17e: Added ability to filter only specific partitions on xsv export with `{partitions: {idx: [keys]}}` option.

## 2.9.10

### Patch Changes

- 2197537: PFrames version bump, PFConv docs update

## 2.9.9

### Patch Changes

- 0d1ffc8: pfconv update

## 2.9.8

### Patch Changes

- 87453b5: pfconv update

## 2.9.7

### Patch Changes

- 37ecd10: Adding quick-sort methods in slices tengo sdk

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
