---
"@platforma-sdk/workflow-tengo": minor
---

- Fixed data parsing logic for `RTYPE_P_COLUMN_DATA_RESOURCE_MAP_PARTITIONED` by correctly handling both `partitionKeyLength` and `keyLength` properties
- Fixed incorrect resource type reference in `flatten` method for resource map partitioned data
- Added `treeJoin` function to pt module for joining multiple DataFrames in a tree-like pattern using recursive pairwise joins
- Added `flatten` function to slices module for flattening nested arrays with support for both shallow and deep flattening modes
- Added comprehensive JSDoc-style documentation to all PColumnData methods including parameter descriptions, return types, and usage examples
- Added `structField` method to expression API for accessing nested data structures with support for single field extraction and nested path resolution using varargs (e.g., `col("location").structField("coordinates", "lat")`)
  - Implements robust error handling using `map_elements` with Python's dict `.get()` method for graceful handling of both null structs and missing fields
  - Supports deeply nested field access with automatic null propagation when intermediate structures are missing
  - Compatible with JSON import workflows where nested structures may have inconsistent schemas across records
