---
"@platforma-sdk/workflow-tengo": minor
---

- Fixed data parsing logic for `RTYPE_P_COLUMN_DATA_RESOURCE_MAP_PARTITIONED` by correctly handling both `partitionKeyLength` and `keyLength` properties
- Fixed incorrect resource type reference in `flatten` method for resource map partitioned data
- Added `treeJoin` function to pt module for joining multiple DataFrames in a tree-like pattern using recursive pairwise joins
- Added `flatten` function to slices module for flattening nested arrays with support for both shallow and deep flattening modes
- Added comprehensive JSDoc-style documentation to all PColumnData methods including parameter descriptions, return types, and usage examples
