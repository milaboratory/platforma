# Data Flow: Fast Search -- Technical Specification

## Overview

Fast Search provides exact-match filtering across all visible filterable columns.
The user types a search string; the system builds an OR-filter of leaf predicates
(one per eligible column) and merges it into the combined filter spec sent to the data pipeline.

Entry point (UI): `PlTableFastSearch` component, bound via `v-model="searchString"`.
Entry point (logic): `createSearchFilterNode()` in `sources/table-state-v2.ts`.
Integration: `createPTableParams()` in the same file merges the search node with partition and advanced filters.

---

## Components

### PlTableFastSearch

Location: `../PlTableFastSearch/PlTableFastSearch.vue`

Thin wrapper around `PlSearchField` from `@milaboratories/uikit`.

| Aspect      | Detail                                          |
| ----------- | ----------------------------------------------- |
| Model       | `defineModel<string>({ required: true })`       |
| Clearable   | Yes                                             |
| Placeholder | `"Search..."`                                   |
| Helper slot | Inline tooltip explaining exact-match semantics |

The component has no internal logic beyond two-way binding. All filtering logic resides in `table-state-v2.ts`.

### searchString reactive ref

Location: `useTableState()` in `sources/table-state-v2.ts`, lines 145-156.

`searchString` is a `WritableComputedRef<string>` backed by `PlDataTableStateV2CacheEntry.searchString`.

| Operation | Behavior                                                                 |
| --------- | ------------------------------------------------------------------------ |
| get       | Returns `tableState.value.searchString ?? ""` (defaults to empty string) |
| set       | Writes new value into the cache entry; skipped when `sourceId === null`  |

The value is persisted in the LRU state cache (see `state-persistence.md`).

---

## Filter Construction

### createSearchFilterNode()

Location: `sources/table-state-v2.ts`, lines 210-237.

```
function createSearchFilterNode(
  columns: PTableColumnSpec[],
  search: null | undefined | string,
): null | FilterSpec<FilterSpecLeaf<CanonicalizedJson<PTableColumnId>>>
```

#### Input

| Parameter | Type                          | Source                                                       |
| --------- | ----------------------------- | ------------------------------------------------------------ |
| `columns` | `PTableColumnSpec[]`          | `visibleFilterableColumns` ref from `useFilterableColumns()` |
| `search`  | `null \| undefined \| string` | `state.searchString` from the cache entry                    |

`visibleFilterableColumns` contains only columns that are (a) data columns (excludes row-number column) and (b) not hidden (`def.hide !== true`). Derived in `compositions/useFilterableColumns.ts`.

#### Algorithm

1. Trim the search string. If the result is `null`, `undefined`, or empty, return `null`.
2. Attempt numeric parse: `Number(trimmed)`. The value is considered a valid number when all three conditions hold:
   - `trimmed.length > 0`
   - `!isNaN(numericValue)`
   - `isFinite(numericValue)`
3. Iterate over every column in `columns`:
   - Extract `column` identifier via `canonicalizeJson(getPTableColumnId(col))`.
   - Read `col.spec` (either `AxisSpec` or `PColumnSpec`).
   - If the column has a string value type, push a `patternEquals` leaf.
   - If the column has a numeric value type AND the search string is a valid number, push an `equal` leaf.
4. If no leaf was produced, return `null`.
5. Wrap all leaves in `{ type: "or", filters: [...] }` and return.

#### Value Type Classification

Both classifiers live in `../PlAdvancedFilter/utils.ts`. They resolve the underlying `ValueType` via `getTypeFromPColumnOrAxisSpec(spec)`, which returns `spec.valueType` for `PColumnSpec` or `spec.type` for `AxisSpec`.

| Function             | Matches these `ValueType` values         |
| -------------------- | ---------------------------------------- |
| `isStringValueType`  | `"String"`                               |
| `isNumericValueType` | `"Int"`, `"Long"`, `"Float"`, `"Double"` |

Columns with `ValueType` = `"Bytes"` are never matched. Columns with no spec (`undefined`) are never matched.

#### Produced Filter Leaf Shapes

| Column type | Filter leaf                                         |
| ----------- | --------------------------------------------------- |
| String      | `{ type: "patternEquals", column, value: trimmed }` |
| Numeric     | `{ type: "equal", column, x: numericValue }`        |

- `patternEquals` performs exact string equality (case-sensitive, no wildcards, no regex).
- `equal` performs exact numeric equality (`71` matches `71` and `71.0`; does not match `710` or `7.1`).

---

## Filter Merging

### createPTableParams()

Location: `sources/table-state-v2.ts`, lines 239-259.

The search filter node is combined with other filter sources:

```
parts = [
  ...convertPartitionFiltersToFilterSpec(state.sheetsState),   // sheet/partition filters
  ...(state.filtersState ? [state.filtersState] : []),         // advanced filters
  ...(searchNode ? [searchNode] : []),                         // search filter
]
```

The `parts` array is reduced to a single `FilterSpec`:

| Parts count | Result                            |
| ----------- | --------------------------------- |
| 0           | `null`                            |
| 1           | The single part as-is             |
| 2+          | `{ type: "and", filters: parts }` |

The combined spec is then passed through `distillFilterSpec()` which strips incomplete/empty leaves before it reaches the data pipeline as `PTableParamsV2.filters`.

---

## Data Flow Diagram

```
PlTableFastSearch (v-model)
  |
  v
searchString (WritableComputedRef<string>)
  |
  v  (persisted in PlDataTableStateV2CacheEntry.searchString)
  |
  v
createSearchFilterNode(visibleFilterableColumns, searchString)
  |
  +-- for each visible column:
  |     isStringValueType(col.spec)  -->  { type: "patternEquals", column, value }
  |     isNumericValueType(col.spec) -->  { type: "equal", column, x }  (only if valid number)
  |
  v
  { type: "or", filters: [leaf, leaf, ...] }   (or null if no leaves)
  |
  v
createPTableParams()
  |
  +-- AND-merge with: partition filters, advanced filters
  |
  v
distillFilterSpec()
  |
  v
PTableParamsV2.filters  -->  server-side data pipeline
```

---

## Column Eligibility

A column participates in fast search when all of the following are true:

| Condition                                | Where checked                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| Column is a data column (not row-number) | `useFilterableColumns` -- filters out `PlAgDataTableRowNumberColId`        |
| Column is not hidden                     | `useFilterableColumns` -- checks `def.hide` flag                           |
| Column has a recognized value type       | `createSearchFilterNode` -- via `isStringValueType` / `isNumericValueType` |

Columns with `ValueType` = `"Bytes"` or with missing spec are silently skipped.

---

## Edge Cases

| Scenario                                                 | Behavior                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Empty or whitespace-only input                           | `createSearchFilterNode` returns `null`; no filter applied  |
| No visible columns                                       | `parts` is empty; returns `null`                            |
| Search string is numeric but no numeric columns visible  | Only `patternEquals` leaves for string columns              |
| Search string is non-numeric but numeric columns visible | Numeric columns skipped; only string columns produce leaves |
| All columns are `Bytes`                                  | No leaves produced; returns `null`                          |
| `sourceId === null`                                      | `searchString` setter is a no-op; value not persisted       |

---

## File Index

| File                                                | Role                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `../PlTableFastSearch/PlTableFastSearch.vue`        | UI input component                                                     |
| `../PlTableFastSearch/index.ts`                     | Re-export                                                              |
| `sources/table-state-v2.ts`                         | `searchString` ref, `createSearchFilterNode()`, `createPTableParams()` |
| `compositions/useFilterableColumns.ts`              | Derives `visibleFilterableColumns` from ag-grid column defs            |
| `../PlAdvancedFilter/utils.ts`                      | `isStringValueType()`, `isNumericValueType()`                          |
| `@milaboratories/pl-model-common` `filter_spec.ts`  | `FilterSpec`, `FilterSpecLeaf` type definitions                        |
| `@milaboratories/pl-model-common` `table_common.ts` | `PTableColumnSpec` type definition                                     |
| `@milaboratories/pl-model-common` `spec.ts`         | `ValueType` enum, `getTypeFromPColumnOrAxisSpec()`                     |
