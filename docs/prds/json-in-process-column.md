# Implementation Plan: PColumnData/Json Support in processColumn

## Overview

The `processColumn` method in `@platforma-sdk/workflow-tengo:pframes` currently supports `PColumnData/ResourceMap`, `PColumnData/JsonPartitioned`, and `PColumnData/BinaryPartitioned` types, but lacks support for the raw `PColumnData/Json` type. This document outlines the implementation plan to add this support.

## Background

`PColumnData/Json` is a fundamental storage type that embeds data directly in the resource metadata, unlike partitioned types that reference external resources. According to the specification:

```typescript
// PColumnData/Json resource structure
{
  resourceType: { name: "PColumnData/Json", version: "1" },
  resourceData: {
    keyLength: number,
    data: Record<PColumnKey, string | number>  // where PColumnKey is JSON-encoded array
  },
  fields: []  // No input fields - data is embedded
}
```

## Current Implementation Analysis

### Files to Modify

1. **`platforma/sdk/workflow-tengo/src/pframes/process-pcolumn-data.tpl.tengo`** (lines 82-521)
2. **`platforma/sdk/workflow-tengo/src/pframes/index.lib.tengo`** (lines 415-420 for primitive type detection)

### Current Flow

The current implementation:
1. Checks for supported types: `isResourceMap`, `isJsonPartitioned`, `isBinaryPartitioned`
2. Extracts metadata and determines `inputKeyLength`
3. Processes data in either:
   - **Mapping mode**: iterates through `data.inputs()` directly
   - **Aggregation mode**: groups data and creates intermediate resources
4. Executes body template for each group/element
5. Collects and aggregates outputs

## Implementation Plan

### Step 1: Add PColumnData/Json Type Detection

**Location**: `process-pcolumn-data.tpl.tengo`, around line 82

```tengo
// Check supported types
isResourceMap := data.checkResourceType(pConstants.RTYPE_P_COLUMN_DATA_RESOURCE_MAP)
isJsonPartitioned := data.checkResourceType(pConstants.RTYPE_P_COLUMN_DATA_JSON_PARTITIONED)
isBinaryPartitioned := data.checkResourceType(pConstants.RTYPE_P_COLUMN_DATA_BINARY_PARTITIONED)
isJson := data.checkResourceType(pConstants.RTYPE_P_COLUMN_DATA_JSON)  // ADD THIS
isPartitioned := isJsonPartitioned || isBinaryPartitioned

if isResourceMap || isPartitioned || isJson {  // UPDATE THIS CONDITION
```

### Step 2: Handle PColumnData/Json Metadata Extraction

**Location**: `process-pcolumn-data.tpl.tengo`, around line 90

```tengo
inputKeyLength := 0
if isResourceMap {
    if !is_map(meta) || is_undefined(meta.keyLength) {
         ll.panic("Invalid metadata for ResourceMap: %v", meta)
    }
    inputKeyLength = meta.keyLength
} else if isPartitioned {
    if !is_map(meta) || is_undefined(meta.partitionKeyLength) {
         ll.panic("Invalid metadata for Partitioned resource: %v", meta)
    }
    inputKeyLength = meta.partitionKeyLength
} else if isJson {  // ADD THIS BLOCK
    if !is_map(meta) || is_undefined(meta.keyLength) || is_undefined(meta.data) {
         ll.panic("Invalid metadata for Json: %v", meta)
    }
    inputKeyLength = meta.keyLength
}
```

### Step 3: Handle Mapping Mode Restrictions

**Location**: `process-pcolumn-data.tpl.tengo`, around line 110

```tengo
// Partitioned inputs cannot be used in mapping mode as the body expects individual elements, not partitions.
if mappingMode && isPartitioned {
    ll.panic("Partitioned PColumn data types (JsonPartitioned, BinaryPartitioned) cannot be used in mapping mode (aggregationIndices not set). Use aggregation mode instead.")
}
```

**Note**: `PColumnData/Json` should support both mapping and aggregation modes, so no additional restriction needed.

### Step 4: Add Anonymization Check for JSON Mode

**Location**: `process-pcolumn-data.tpl.tengo`, around line 70

```tengo
// Check for unsupported combinations
if isJson && !is_undefined(anonymizationIndices) && len(anonymizationIndices) > 0 {
    ll.panic("Anonymization is not supported for PColumnData/Json. Anonymization currently works only with resources.")
}
```

### Step 5: Implement Data Processing Logic

**Location**: `process-pcolumn-data.tpl.tengo`, around line 118

#### For Mapping Mode:

```tengo
if mappingMode {
    groupKeyLength = inputKeyLength
    
    if isJson {
        // For PColumnData/Json in mapping mode, iterate through embedded data
        embeddedData := meta.data
        for sKey, value in embeddedData {
            // Create a simple JSON resource containing the primitive value
            valueResource := smart.createJsonResource(value)
            groups[sKey] = valueResource
        }
    } else {
        // Existing logic for ResourceMap
        for sKey, field in data.inputs() {
            groups[sKey] = field
        }
    }
} else { // Aggregation mode
```

#### For Aggregation Mode:

```tengo
} else { // aggregation mode
    // Calculate group indices based on inputKeyLength
    groupIndices := pUtil.calculateGroupAxesIndices(inputKeyLength, aggregationIndices)
    groupKeyLength = len(groupIndices)
    groupElementKeyLength := inputKeyLength - len(groupIndices)
    
    if groupElementKeyLength < 0 {
        ll.panic("Group element key length is negative: %v", groupElementKeyLength)
    }
    
    if !isPartitioned && !isJson {
        ll.assert(groupElementKeyLength == len(aggregationIndices),
          "Group element key length is not equal to aggregation indices length: %v != %v",
          groupElementKeyLength, len(aggregationIndices))
    }

    if isJson {
        // For PColumnData/Json in aggregation mode
        embeddedData := meta.data
        for sKey, value in embeddedData {
            key := json.decode(sKey) // Parse the JSON-encoded key array
            
            groupKey := []
            for i in groupIndices {
                if len(key) <= i {
                    ll.panic("Key length is less than aggregation index: %v, key: %v", i, key)
                }
                groupKey = append(groupKey, key[i])
            }

            inGroupKey := []
            for i in aggregationIndices {
                if len(key) <= i {
                    ll.panic("Key length is less than aggregation index: %v, key: %v", i, key)
                }
                inGroupKey = append(inGroupKey, key[i])
            }

            sGroupKey := json.encode(groupKey)
            sInGroupKey := json.encode(inGroupKey)

            group := groups[sGroupKey]
            if is_undefined(group) {
                // Create a plain map to collect grouped data
                group = {}
                groups[sGroupKey] = group
            }
            
            // Add the value directly to the group map
            group[sInGroupKey] = value
        }
        
        // After collecting all data, convert maps to PColumnData/Json resources
        for sGroupKey, groupData in groups {
            groups[sGroupKey] = smart.structBuilder(
                pConstants.RTYPE_P_COLUMN_DATA_JSON,
                json.encode({ 
                    keyLength: groupElementKeyLength,
                    data: groupData
                })
            )
        }
    } else {
        // Existing logic for ResourceMap and Partitioned types
        for sKey, field in data.inputs() {
            // ... existing code ...
        }
    }
}
```

### Step 6: Handle Body Template Execution

**Location**: `process-pcolumn-data.tpl.tengo`, around line 280

The template execution logic should work as-is for both modes:

- **Mapping mode**: `groupValue` will be the JSON resource containing the primitive value
- **Aggregation mode**: `groupValue` will be a `PColumnData/Json` resource containing the grouped data

```tengo
for sGroupKey, groupValue in groups {
    renderInputs := {}

    if passKey {
        renderInputs[pConstants.KEY_FIELD_NAME] = json.decode(sGroupKey)
    }

    if mappingMode {
        // For PColumnData/Json: groupValue is a JSON resource with primitive value
        // For ResourceMap: groupValue is a field ref to input map element  
        renderInputs[pConstants.VALUE_FIELD_NAME] = groupValue
    } else {
        // For all types: groupValue is a resource constructed above
        value := groupValue.lockAndBuild()
        if !is_undefined(anonymizationIndices) && len(anonymizationIndices) > 0 {
            value = anonymize.anonymizePKeys(value, anonymizationIndices).result
        }
        renderInputs[pConstants.VALUE_FIELD_NAME] = value
    }
    
    // ... rest of template execution logic remains the same
}
```

### Step 7: Update Primitive Type Detection

**Location**: `index.lib.tengo`, around line 415

```tengo
// Infer if data is likely partitioned based on valueType
// Primitive types are assumed to use partitioned storage (Json/Binary)
isPotentiallyPartitioned := __primitiveValueTypes[input.spec.valueType]

// For partitioned data, the underlying template determines key length internally.
// For ResourceMap and Json, we pass the expected length based on the spec.
if !isPotentiallyPartitioned {
    processTemplateParams.expectedKeyLength = len(input.spec.axesSpec)
}
```

The logic should be updated to also handle `PColumnData/Json`:

```tengo
// Infer if data is likely partitioned based on valueType
// Primitive types are assumed to use partitioned storage (Json/Binary)
isPotentiallyPartitioned := __primitiveValueTypes[input.spec.valueType]

// For partitioned data, the underlying template determines key length internally.
// For ResourceMap, Json, and ResourceMap, we pass the expected length based on the spec.
isDirectKeyLength := !isPotentiallyPartitioned  // ResourceMap, Json have direct keyLength
if isDirectKeyLength {
    processTemplateParams.expectedKeyLength = len(input.spec.axesSpec)
}
```

## Testing Considerations

### Test Cases Needed

1. **Mapping Mode Tests**:
   - `PColumnData/Json` with simple primitive values (int, string)
   - Body template receives individual primitive values via `__value__`
   - Output collection works correctly

2. **Aggregation Mode Tests**:
   - `PColumnData/Json` with multi-axis keys
   - Grouping logic works correctly 
   - Body template receives `PColumnData/Json` resource with grouped data
   - Various aggregation indices combinations

3. **Edge Cases**:
   - Empty data
   - Single key-value pair
   - Complex keys with multiple axes
   - Integration with `passKey`, anonymization, etc.

### Expected Body Template Contract

**Mapping Mode**:
```tengo
// Input: __value__ contains JSON resource with primitive value
// Input: __key__ contains parsed key array (if passKey=true)
self.body(func(inputs) {
    valueResource := inputs.__value__  // JSON resource containing primitive value
    primitiveValue := valueResource.getDataAsJson()  // Extract the actual value
    key := inputs.__key__     // [keyElement1, keyElement2, ...] 
    
    // Process individual value
    return { result: processValue(primitiveValue, key) }
})
```

**Aggregation Mode**:
```tengo
// Input: __value__ contains PColumnData/Json resource with grouped data
// Input: __key__ contains group key array (if passKey=true)
self.body(func(inputs) {
    groupResource := inputs.__value__  // PColumnData/Json resource
    groupKey := inputs.__key__         // group key array
    
    // Access grouped data
    meta := groupResource.getDataAsJson()
    groupedData := meta.data  // Map: { "jsonEncodedKey": value, ... }
    
    // Process grouped data
    for keyStr, value in groupedData {
        remainingKey := json.decode(keyStr)  // Parse remaining key elements
        // Process value with remainingKey...
    }
    
    return { result: processGroup(groupedData, groupKey) }
})
```

## Implementation Notes

1. **Resource Creation**: 
   - Mapping mode: Use `smart.createJsonResource(value)` for individual primitive values
   - Aggregation mode: Collect data in simple maps first, then create `PColumnData/Json` resource at the end
2. **Data Collection Strategy**: Build simple maps during aggregation, then wrap in resource structure
3. **Key Validation**: Ensure JSON-encoded keys are properly decoded and validated
4. **Anonymization Restriction**: Throw error if anonymization is attempted with JSON mode (not supported)
5. **Performance**: Efficient data collection followed by single resource creation per group
6. **Backward Compatibility**: Changes are additive and don't affect existing supported types

## Validation

The implementation should be validated against existing patterns in:
- `export-pcolumn.lib.tengo` (line 34-48) - shows `PColumnData/Json` handling
- `xsv-export-pframe.tpl.tengo` (line 62-82) - shows data access pattern
- `data.lib.tengo` (line 123-125) - shows data parsing pattern

This ensures consistency with the rest of the codebase.
