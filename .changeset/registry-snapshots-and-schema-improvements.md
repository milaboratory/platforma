---
"@platforma-sdk/block-tools": minor
"@milaboratories/pl-model-middle-layer": patch
"@milaboratories/pl-error-like": patch
"@milaboratories/pl-errors": patch
"@milaboratories/pl-deployments": patch
---

**Registry Overview Snapshots & Enhanced Schema Backward Compatibility**

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
