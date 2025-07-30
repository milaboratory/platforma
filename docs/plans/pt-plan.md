# PTabler Tengo API: NDJSON Support and Format Parameter Upgrade

## Overview

This plan implements NDJSON file format support in the Tengo pt API and modernizes the parameter naming. The PTabler backend already fully supports NDJSON through `read_ndjson` and `write_ndjson` steps - we just need to expose this functionality in the Tengo API.

## Current State Analysis

### ✅ PTabler Backend Support (Already Available)
- `ReadNdjsonStep` with type `'read_ndjson'`  
- `WriteNdjsonStep` with type `'write_ndjson'`
- Full `BaseFileReadStep` support: `nRows`, `schema`, `inferSchema`, `ignoreErrors`
- Full `BaseFileWriteStep` support: `columns` selection

### ❌ Missing Tengo API Support
- Only supports `xsvType: "csv"|"tsv"` in `wf.frame()`
- Only generates `read_csv` and `write_csv` steps
- No `nRows` parameter exposure
- No automatic file extension detection for JSON formats

## Implementation Plan

### 1. Parameter Modernization

#### 1.1 Add `format` Parameter (Primary)
- **New parameter**: `format: "csv"|"tsv"|"ndjson"`
- **Backward compatibility**: Keep `xsvType` parameter working
- **Priority**: `format` overrides `xsvType` if both provided
- **Auto-detection**: Infer format from file extensions

#### 1.2 File Extension Auto-Detection
```javascript
// Extension -> Format mapping
.csv    -> "csv"
.tsv    -> "tsv" 
.ndjson -> "ndjson"
.jsonl  -> "ndjson"
```

### 2. Reading Support (`wf.frame()`)

#### 2.1 Update Format Logic
```javascript
// Current: finalXsvType == "csv" || finalXsvType == "tsv"
// New: finalFormat in ["csv", "tsv", "ndjson"]

// Step type selection:
finalFormat in ["csv", "tsv"] -> "read_csv" step + delimiter
finalFormat == "ndjson" -> "read_ndjson" step
```

#### 2.2 Add nRows and ignoreErrors Parameter Support
```javascript
// New option in frame() method
{
  format: "ndjson",        // or xsvType for backward compatibility
  nRows: 1000,            // NEW: limit rows read
  schema: [...],          // existing
  inferSchema: true,      // existing  
  ignoreErrors: false     // NEW: expose existing backend support
}
```

#### 2.3 Enhanced Step Generation
```javascript
// For NDJSON files
readNdjsonStep := {
  type: "read_ndjson",
  file: finalFileName,
  name: finalDataFrameId,
  // Optional fields:
  schema: finalSchemaToUse,      // if provided
  inferSchema: inferSchemaOpt,   // if false
  ignoreErrors: ignoreErrorsOpt, // if true
  nRows: nRowsOpt               // if provided
}
```

### 3. Writing Support (`df.save()`)

#### 3.1 Update Save Logic  
```javascript
// Current: only CSV/TSV via write_csv
// New: Auto-detect or explicit format

// Extension detection:
if text.has_suffix(outputFile, ".ndjson") || 
   text.has_suffix(outputFile, ".jsonl") ||
   text.has_suffix(outputFile, ".json") {
  stepType = "write_ndjson"
} else if text.has_suffix(outputFile, ".csv") {
  stepType = "write_csv"
  delimiter = ","
} else if text.has_suffix(outputFile, ".tsv") {
  stepType = "write_csv" 
  delimiter = "\t"
}

// Override with explicit format option
if opts.format == "ndjson" {
  stepType = "write_ndjson"
}
```

#### 3.2 Enhanced Save Options
```javascript
df.save("output.ndjson", {
  format: "ndjson",     // NEW: explicit format override
  columns: ["id", "name"] // existing: column selection
})

// Backward compatibility
df.save("output.csv", {
  xsvType: "csv"        // still works
})
```

### 4. Documentation Updates

#### 4.1 JSDoc Examples
```javascript
/**
 * @example
 *   // NDJSON from file reference
 *   df := wf.frame(inputs.dataFile, {format: "ndjson"})
 *
 *   // NDJSON with row limit and schema override  
 *   df := wf.frame(inputs.largeFile, {
 *     format: "ndjson",
 *     nRows: 10000,
 *     schema: [{column: "id", type: "Int64"}]
 *   })
 *
 *   // Auto-detection from extension
 *   df := wf.frame(inputs.dataFile)  // .ndjson extension auto-detected
 *
 *   // Backward compatibility
 *   df := wf.frame(inputs.csvFile, {xsvType: "csv"})  // still works
 */
```

#### 4.2 Save Examples
```javascript
/**
 * @example
 *   // NDJSON output
 *   df.save("result.ndjson")  // auto-detected
 *   df.save("result.j", {format: "ndjson"})  // explicit override
 *   
 *   // With column selection
 *   df.save("subset.jsonl", {columns: ["id", "score"]})
 */
```

### 5. Testing Strategy

#### 5.1 New Test Cases
```javascript
// In pt/expression.test.tengo or new test file
TestNdjsonReading := func() {
  wf := pt.workflow()
  
  // Test NDJSON string content
  ndjsonContent := `{"id": 1, "name": "Alice"}
{"id": 2, "name": "Bob"}`
  df := wf.frame(ndjsonContent, {format: "ndjson", id: "testNdjson"})
  
  // Test with nRows limit
  dfLimited := wf.frame(ndjsonContent, {format: "ndjson", nRows: 1})
  
  // Test auto-detection
  dfAuto := wf.frame("test.ndjson", {id: "autoDetect"})  // mock file
}

TestFormatBackwardCompatibility := func() {
  wf := pt.workflow()
  
  // Old xsvType should still work
  df1 := wf.frame("data.csv", {xsvType: "csv"})
  
  // New format should work  
  df2 := wf.frame("data.csv", {format: "csv"})
  
  // format overrides xsvType
  df3 := wf.frame("data.json", {xsvType: "csv", format: "ndjson"})
}
```

#### 5.2 Integration Tests
- Test actual NDJSON file processing end-to-end
- Verify nRows parameter works correctly
- Test schema override with NDJSON
- Test error handling with malformed NDJSON

### 6. Implementation Files

#### 6.1 Primary Changes
- `platforma/sdk/workflow-tengo/src/pt/index.lib.tengo`
  - Update `frame()` method logic
  - Update `_addSaveStep()` helper
  - Add file extension detection
  - Add backward compatibility handling

#### 6.2 Test Updates  
- `platforma/sdk/workflow-tengo/src/pt/expression.test.tengo`
  - Add NDJSON test cases
  - Add backward compatibility tests
  - Add nRows parameter tests

#### 6.3 Documentation
- Update JSDoc comments throughout
- Add comprehensive examples
- Document migration path from xsvType to format

### 7. Validation Checklist

#### 7.1 Functional Requirements
- [ ] `format: "ndjson"` creates `read_ndjson` steps
- [ ] `format: "ndjson"` creates `write_ndjson` steps  
- [ ] `nRows` parameter limits rows read
- [ ] File extension auto-detection works
- [ ] `xsvType` parameter still works (backward compatibility)
- [ ] `format` overrides `xsvType` when both provided
- [ ] Schema, inferSchema, ignoreErrors work with NDJSON
- [ ] Column selection works with NDJSON output

#### 7.2 Edge Cases
- [ ] Invalid format values show clear error messages
- [ ] Mixed format specifications handled correctly
- [ ] Empty/missing file extensions handled gracefully
- [ ] Large NDJSON files with nRows work efficiently

#### 7.3 Backward Compatibility
- [ ] Existing code using `xsvType: "csv"` unchanged
- [ ] Existing code using `xsvType: "tsv"` unchanged  
- [ ] No breaking changes to existing API surface

### 8. Future Considerations

#### 8.1 Additional Formats
- The new `format` parameter structure easily supports future formats
- Could add `"parquet"`, `"json"` (full JSON arrays), etc.

#### 8.2 Advanced NDJSON Features  
- JSON schema validation
- Nested object flattening options
- Custom JSON parsing options

This plan ensures complete NDJSON support while maintaining full backward compatibility and setting up a flexible foundation for future format additions.
