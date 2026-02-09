# @milaboratories/pl-error-like

## 1.12.6

### Patch Changes

- f89a883: full integration oxc

## 1.12.5

### Patch Changes

- 0ff2a1b: **Registry Overview Snapshots & Enhanced Schema Backward Compatibility**

  Added comprehensive snapshot functionality for registry overviews and improved Zod schema compatibility across the entire codebase.

  ## Registry Snapshots (minor)

  - **Automatic backup creation**: Overview files are automatically backed up during every registry update with gzipped compression
  - **Organized storage structure**: Snapshots stored in `_overview_snapshots_v2/global/` and `per_package/` folders mirroring main hierarchy
  - **Security features**: Millisecond timestamps with random suffixes prevent CDN retrieval attacks
  - **CLI management tools**: Added `list-overview-snapshots` and `restore-overview-from-snapshot` commands with safety confirmations
  - **Configurable behavior**: `skipSnapshotCreation` setting allows disabling snapshots when needed
  - **Comprehensive testing**: Full test coverage ensures reliability

  ## Schema Backward Compatibility (patch)

  - **Strategic schema improvements**: Enhanced Zod schemas to prevent data loss during version transitions
  - **Smart classification**: Applied `.passthrough()` to evolving data structures (overviews, manifests, registries, errors) while maintaining `.strict()` for closed types (content types, identifiers)
  - **Wide compatibility coverage**: Updated schemas across block metadata, registry specifications, error structures, and deployment configurations
  - **Forward compatibility**: Older versions will now preserve unknown fields instead of stripping them during parsing

  These improvements ensure robust registry management with automatic backup capabilities and seamless schema evolution without breaking changes.

## 1.12.4

### Patch Changes

- b14b2fb: update dist builder

## 1.12.3

### Patch Changes

- 3f93434: Packages configuration normalization

## 1.12.2

### Patch Changes

- 37800c5: Public tools packages

## 1.12.1

### Patch Changes

- 141aebc: Minor monetization sidebar appearance fixes

## 1.12.0

### Minor Changes

- ff0f92c: Breaking Changes:
  type `ValueOrErrors` now has `ErrorLike` errors instead of `string` errors.
  Several places that handles errors from block outputs, fields (when we use `resolve` in model), or in the result pool could be broken.

  Migration steps:

  - if your model handles errors (e.g. via try/catch) in the result pool, in outputs or in `resolve`, then your block will stop compiling. The type of errors was changed from `string` to `ErrorLike`, to get the error as string, get `.message` or `.fullMessage` attribute on the new error.
