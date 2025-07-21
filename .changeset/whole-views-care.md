---
'@platforma-sdk/workflow-tengo': minor
---

Add support for new column kinds in TsvContent settings for pframes processing

**New Column Kinds:**
- `kind: "line"` - Exports raw TSV line content as String PColumn
- `kind: "json-line"` - Exports JSON-encoded line content as String PColumn with configurable field mapping
- `kind: "column"` - Explicit version of existing behavior (backward compatible)

**Features:**
- **Backward Compatibility**: Existing TsvContent configurations without `kind` field continue to work unchanged
- **Schema Validation**: Added closed validation schemas with proper type enforcement
- **String Type Enforcement**: `line` and `json-line` kinds are validated to only accept `String` valueType in specs
- **JSON Field Mapping**: `json-line` supports custom field IDs for JSON property names via nested `columns` array
- **Code Optimization**: Refactored repetitive column ID extraction logic with helper functions

**Breaking Changes:** None - fully backward compatible

**Migration:** No migration required. Existing code continues to work. New `kind` field is optional and defaults to `"column"` behavior.
