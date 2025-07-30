---
"@platforma-sdk/workflow-tengo": minor
---

Add NDJSON support to pt (PTabler) API

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
wf.frame(content, {format: "ndjson", nRows: 100})

// Writing NDJSON  
df.save("output.jsonl")
df.save("data.txt", {format: "ndjson"})
```