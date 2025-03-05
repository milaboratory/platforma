---
'@platforma-sdk/workflow-tengo': minor
---

# Tools to process PColumns with optionally absent results (sparse results)

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

