---
'@platforma-sdk/workflow-tengo': minor
---

Add support for new column kinds in TsvContent settings and PColumnData/Json processing

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
