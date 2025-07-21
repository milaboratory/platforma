---
'@platforma-sdk/workflow-tengo': minor
---

Add support for new column kinds in TsvContent settings and PColumnData/Json processing

**New Column Kinds:**
- `kind: "line"` - Exports raw TSV line content as String PColumn
- `kind: "json-line"` - Exports JSON-encoded line content as String PColumn with configurable field mapping
- `kind: "column"` - Explicit version of existing behavior (backward compatible)

**PColumnData/Json Support:**
- **New Resource Type Support**: Added full support for `PColumnData/Json` in `processColumn` function
- **Embedded Data Processing**: Supports primitive data embedded directly in resource metadata (unlike partitioned types that reference external resources)
- **Dual Mode Operation**: 
  - **Mapping Mode**: Processes individual primitive values directly through automatic unmarshalling
  - **Aggregation Mode**: Groups embedded data and creates intermediate `PColumnData/Json` resources for body template processing
- **Type Detection**: Added proper resource type detection and validation for `PColumnData/Json`
- **Metadata Extraction**: Handles `keyLength` and embedded `data` fields from resource metadata
- **Anonymization Restriction**: Prevents anonymization with `PColumnData/Json` (only supported for resource-based types)

**Features:**
- **Backward Compatibility**: Existing TsvContent configurations without `kind` field continue to work unchanged
- **Schema Validation**: Added closed validation schemas with proper type enforcement
- **String Type Enforcement**: `line` and `json-line` kinds are validated to only accept `String` valueType in specs
- **JSON Field Mapping**: `json-line` supports custom field IDs for JSON property names via nested `columns` array
- **Code Optimization**: Refactored repetitive column ID extraction logic with helper functions

**Breaking Changes:** None - fully backward compatible

**Migration:** No migration required. Existing code continues to work. New `kind` field is optional and defaults to `"column"` behavior.
