# Data Flow: Column Filters

## Overview

Column filters allow users to define complex filter expressions on table columns. The filter state is a tree structure (AND/OR groups of leaf predicates) managed by `PlTableFiltersV2` and persisted as part of `PlDataTableStateV2CacheEntry.filtersState`. On every change, the filter tree is merged with partition filters (sheets) and search filters, distilled into a clean `FilterSpec`, and written to `PTableParamsV2.filters` for consumption by the data pipeline.

---

## Key Files

| File                                                 | Role                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlTableFilters/PlTableFiltersV2.vue`                | Filter panel UI. Converts column specs to `PlAdvancedFilterItem[]`, renders `PlAdvancedFilterComponent` in a slide modal, handles value suggestions. |
| `PlAgDataTable/sources/table-state-v2.ts`            | `useTableState()` -- owns `filtersState` ref. `createPTableParams()` merges three filter sources and distills the result.                            |
| `PlAgDataTable/compositions/useFilterableColumns.ts` | `useFilterableColumns()` -- derives two column lists (all filterable, visible-only) from ag-grid column definitions.                                 |
| `PlAdvancedFilter/`                                  | Generic tree-based filter editor component. Defines `PlAdvancedFilter`, `PlAdvancedFilterItem`, filter type constants.                               |
| `@platforma-sdk/model` `typesV5.ts`                  | Type definitions: `PlDataTableFiltersWithMeta`, `PlDataTableFilters`, `PlDataTableFilterSpecLeaf`, `PTableParamsV2`.                                 |
| `@platforma-sdk/model` `filters/distill.ts`          | `distillFilterSpec()` -- strips metadata, removes unfilled leaves, collapses empty groups.                                                           |
| `@platforma-sdk/model` `filters/traverse.ts`         | `traverseFilterSpec()` -- bottom-up tree traversal with visitor pattern.                                                                             |
| `@platforma-sdk/model` `pframe_utils/index.ts`       | `getUniqueSourceValuesWithLabels()` -- fetches suggestion values from PFrame for filter inputs.                                                      |
| `@milaboratories/pl-model-common` `filter_spec.ts`   | Core type definitions: `FilterSpec`, `FilterSpecLeaf`, `FilterSpecNode`, `RootFilterSpec`.                                                           |

---

## Type Hierarchy

### FilterSpec (generic tree)

```
FilterSpecNode<Leaf, CommonNode, CommonLeaf> =
  | (CommonLeaf & Leaf)                                          // leaf
  | (CommonNode & { type: "not"; filter: FilterSpecNode<...> })  // negation
  | (CommonNode & { type: "or";  filters: FilterSpecNode<...>[] }) // disjunction
  | (CommonNode & { type: "and"; filters: FilterSpecNode<...>[] }) // conjunction

FilterSpec<Leaf, CommonNode, CommonLeaf> = FilterSpecNode<Leaf, CommonNode, CommonLeaf>

RootFilterSpec<Leaf, CommonNode, CommonLeaf> =
  Extract<FilterSpec<...>, { type: "or" | "and" }>
```

`CommonNode` and `CommonLeaf` are metadata slots. The UI uses `{ id: number; isExpanded?: boolean }` for these. The distilled output uses `{}` (no metadata).

### FilterSpecLeaf (leaf predicates)

Generic parameter `T` is the column identifier type.

| Variant                           | Fields                                                                                        | Applies to                     |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------ |
| `{ type: undefined }`             | none                                                                                          | Unfilled placeholder (UI only) |
| `isNA`                            | `column: T`                                                                                   | Any column                     |
| `isNotNA`                         | `column: T`                                                                                   | Any column                     |
| `patternEquals`                   | `column: T, value: string`                                                                    | String columns                 |
| `patternNotEquals`                | `column: T, value: string`                                                                    | String columns                 |
| `patternContainSubsequence`       | `column: T, value: string`                                                                    | String columns                 |
| `patternNotContainSubsequence`    | `column: T, value: string`                                                                    | String columns                 |
| `patternMatchesRegularExpression` | `column: T, value: string`                                                                    | String columns                 |
| `patternFuzzyContainSubsequence`  | `column: T, value: string, maxEdits?: number, substitutionsOnly?: boolean, wildcard?: string` | String columns                 |
| `inSet`                           | `column: T, value: string[]`                                                                  | String columns                 |
| `notInSet`                        | `column: T, value: string[]`                                                                  | String columns                 |
| `equal`                           | `column: T, x: number`                                                                        | Numeric columns                |
| `notEqual`                        | `column: T, x: number`                                                                        | Numeric columns                |
| `lessThan`                        | `column: T, x: number`                                                                        | Numeric columns                |
| `greaterThan`                     | `column: T, x: number`                                                                        | Numeric columns                |
| `lessThanOrEqual`                 | `column: T, x: number`                                                                        | Numeric columns                |
| `greaterThanOrEqual`              | `column: T, x: number`                                                                        | Numeric columns                |
| `topN`                            | `column: T, n: number`                                                                        | Numeric columns                |
| `bottomN`                         | `column: T, n: number`                                                                        | Numeric columns                |
| `equalToColumn`                   | `column: T, rhs: T`                                                                           | Cross-column                   |
| `lessThanColumn`                  | `column: T, rhs: T, minDiff?: number`                                                         | Cross-column                   |
| `greaterThanColumn`               | `column: T, rhs: T, minDiff?: number`                                                         | Cross-column                   |
| `lessThanColumnOrEqual`           | `column: T, rhs: T, minDiff?: number`                                                         | Cross-column                   |
| `greaterThanColumnOrEqual`        | `column: T, rhs: T, minDiff?: number`                                                         | Cross-column                   |
| `ifNa`                            | `column: T, replacement: string`                                                              | Any column                     |

### Concrete type aliases in PlAgDataTable context

| Type                         | Definition                                                                                                                   | Column identifier type                 | Metadata                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------ |
| `PlDataTableFilterSpecLeaf`  | `FilterSpecLeaf<CanonicalizedJson<PTableColumnId>>`                                                                          | Canonicalized JSON of `PTableColumnId` | none                           |
| `PlDataTableFilters`         | `RootFilterSpec<PlDataTableFilterSpecLeaf>`                                                                                  | same                                   | `{}` (clean)                   |
| `PlDataTableFiltersWithMeta` | `RootFilterSpec<PlDataTableFilterSpecLeaf, { id: number; isExpanded?: boolean; source?: "table-filter" \| "table-search" }>` | same                                   | `{ id, isExpanded?, source? }` |

`PlDataTableFiltersWithMeta` is the UI-facing type (persisted in state cache). `PlDataTableFilters` is the distilled type (written to `PTableParamsV2.filters`).

---

## Column Identifier Resolution

The column identifier used in filter leaves is `CanonicalizedJson<PTableColumnId>`.

```
PTableColumnId = { type: "column"; id: PObjectId }
               | { type: "axis"; id: AxisId }
```

`canonicalizeJson()` produces a deterministic JSON string, enabling use as a map key and equality comparison by string identity.

In `PlTableFiltersV2.vue`, `makeFilterColumnId()` converts `PTableColumnSpec` to `CanonicalizedJson<PTableColumnId>` via `getPTableColumnId(spec)` then `canonicalizeJson()`.

In `handleSuggestOptions()`, the inverse operation (`parseJson()`) recovers the typed `PTableColumnId` to determine whether it refers to a column or axis and to pass the raw `PObjectId` to PFrame driver calls.

---

## Data Flow Stages

### 1. Column list derivation (`useFilterableColumns`)

**Input:** ag-grid `ColDef[]` from `gridOptions.value.columnDefs`, current `sourceId`.

**Processing:**

1. Filters out non-data columns (column groups, row-number column).
2. For each `ColDef`, extracts `colId` (a `PlTableColumnIdJson`), parses it, takes the `.labeled` field (a `PTableColumnSpec`).
3. Produces two lists:
   - `filterableColumns`: all data columns (regardless of visibility).
   - `visibleFilterableColumns`: only columns where `def.hide` is not `true`.

**Output:** Two `Ref<PTableColumnSpec[]>`.

**Consumer:** `filterableColumns` is passed to `PlTableFiltersV2` as the `columns` prop. `visibleFilterableColumns` is passed to `useTableState()` for use in `createSearchFilterNode()`.

### 2. Filter panel rendering (`PlTableFiltersV2`)

**Inputs:**

- `columns: PTableColumnSpec[]` -- all filterable columns.
- `pframeHandle: Nil | PFrameHandle` -- for fetching suggestion values.
- `v-model: PlDataTableFiltersWithMeta` -- bidirectional binding to `filtersState`.

**Column-to-item mapping** (`items` computed):
For each column spec:

1. Generate `id` via `makeFilterColumnId(spec)`.
2. Read `Annotation.Label` from the spec; fall back to `"Unlabeled {type} {index}"`.
3. Read alphabet from `Domain.Alphabet` or `Annotation.Alphabet`.
4. Produce `PlAdvancedFilterItem`: `{ id, label, spec, alphabet }`.

**Supported filter types** (subset of all `FilterSpecLeaf` variants):

| Category           | Types                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NA checks          | `isNA`, `isNotNA`                                                                                                                                                     |
| Numeric comparison | `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `equal`, `notEqual`                                                                               |
| String matching    | `patternEquals`, `patternNotEquals`, `patternContainSubsequence`, `patternNotContainSubsequence`, `patternMatchesRegularExpression`, `patternFuzzyContainSubsequence` |

Not exposed in the filter panel: `inSet`, `notInSet`, `topN`, `bottomN`, `ifNa`, cross-column comparisons. These are supported by `PlAdvancedFilter` generically but excluded from the `supportedFilters` prop.

**Suggestion values** (`handleSuggestOptions`):

1. Parse `columnId` back to `PTableColumnId`.
2. Assert `type === "column"`.
3. Call `getUniqueSourceValuesWithLabels(pframeHandle, { columnId, axisIdx, limit: 100, searchQuery?, searchQueryValue? })`.
4. Returns `{ value, label }[]`.

The suggestion pipeline in `getUniqueSourceValuesWithLabels`:

1. Fetch column spec via `getColumnSpecById`.
2. If the column has a `DiscreteValues` annotation, parse and return those directly.
3. If `axisIdx` is provided, fetch axis values (with label column lookup).
4. Otherwise, fetch column unique values via `getColumnUniqueValues` (PFrame driver call).

**UI rendering:**

- A "Filters" button teleports to the page title area (`PlBlockPageTitleTeleportTarget`).
- The button icon toggles between `filter` and `filter-on` depending on `model.value.filters.length > 0`.
- Clicking opens a `PlSlideModal` containing `PlAdvancedFilterComponent`.

### 3. Filter state persistence

`filtersState` is a `computed` inside `useTableState()`:

**Read path:**

1. Get `tableState.value.filtersState` (from the LRU cache entry for current `sourceId`).
2. Validate shape: must have `type` of `"and"` or `"or"`, must have a `filters` array.
3. If invalid, return a default empty root: `{ id: randomInt(), type: "and", isExpanded: true, filters: [] }`.

**Write path:**

1. Merge new `filtersState` into the current cache entry.
2. Trigger `tableState` setter, which calls `createPTableParams()` and persists.

**Deep reactivity:**
`filtersState` (a `computed`) is wrapped in a `ref()` (`filtersStateDeepReactive`) and synced back via a deep watcher. This enables Vue's deep reactivity tracking on the tree structure, so mutations within nested filter nodes trigger persistence.

### 4. Filter merging (`createPTableParams`)

Called on every write to `tableState`. Combines three independent filter sources into a single `FilterSpec`.

**Source 1: Partition filters** (`convertPartitionFiltersToFilterSpec`):

- Input: `sheetsState: PlDataTableSheetState[]` (axis value selections).
- For each sheet: produce a leaf `{ type: "equal", column, x }` (numeric) or `{ type: "patternEquals", column, value }` (string).
- Column identifier: `canonicalizeJson<PTableColumnId>({ type: "axis", id: s.axisId })`.

**Source 2: Column filters** (`state.filtersState`):

- The `PlDataTableFiltersWithMeta` tree as-is. May be `null`.

**Source 3: Search filter** (`createSearchFilterNode`):

- Input: `columns: PTableColumnSpec[]` (visible filterable columns), `search: string`.
- For each visible column:
  - If string-typed: add `{ type: "patternEquals", column, value: trimmedSearch }`.
  - If numeric-typed and search parses as a valid finite number: add `{ type: "equal", column, x: numericValue }`.
- Wrap all parts in `{ type: "or", filters: [...] }`.
- Returns `null` if search is empty or no parts generated.

**Merge logic:**

```
parts = [
  ...partitionFilters,      // 0..N leaves
  ...columnFilters,          // 0 or 1 tree node
  ...searchFilter,           // 0 or 1 OR-group
]

combined =
  parts.length === 0 ? null
  parts.length === 1 ? parts[0]
  else                ? { type: "and", filters: parts }
```

All three sources are joined with AND semantics at the top level.

### 5. Distillation (`distillFilterSpec`)

Applied to the merged filter before writing to `PTableParamsV2.filters`.

**Purpose:** Strip UI metadata, remove unfilled leaves, collapse empty groups.

**Algorithm** (bottom-up traversal via `traverseFilterSpec`):

1. **Leaf handler:** Whitelist known fields (`type`, `column`, `value`, `x`, `n`, `rhs`, `minDiff`, `maxEdits`, `wildcard`, `replacement`, `substitutionsOnly`). Drop everything else (e.g. `id`, `isExpanded`, `source`). If the leaf is not "filled" (type is undefined, or any field is empty/undefined), return `null`.
2. **AND/OR handler:** Filter out `null` children. If no children remain, return `null`. Otherwise return `{ type, filters: [...nonNullChildren] }`.
3. **NOT handler:** If inner result is `null`, return `null`. Otherwise return `{ type: "not", filter: innerResult }`.

**"Filled" check (`isFilledLeaf`):**

- `type` must not be null/undefined.
- No field value may be: an empty string (after trim), undefined, null, or an empty object/array.
- Numbers and booleans are always considered filled.

**Output type:** `PlDataTableFilters` (a `RootFilterSpec` with no metadata, or `null`).

### 6. Downstream consumption

`PTableParamsV2.filters` (type `null | PlDataTableFilters`) is read by `createPlDataTableV3()` / `createPlDataTableV2()` in `@platforma-sdk/model`. There it is:

1. Merged with any programmatic filters from `CreatePlDataTableOps.filters`.
2. Validated: all column references must match discovered columns.
3. Remapped: column IDs translated from `PTableColumnId` to internal representations.
4. Passed to the PFrame driver for server-side filtering.

---

## Complete Data Flow Diagram

```
useFilterableColumns()
  Input: gridOptions.columnDefs, sourceId
  Output: filterableColumns, visibleFilterableColumns
           |                          |
           v                          v
PlTableFiltersV2                 createSearchFilterNode()
  columns = filterableColumns      columns = visibleFilterableColumns
  pframeHandle (for suggestions)   search = state.searchString
  v-model = filtersState           |
           |                       v
           v                   search OR-group (or null)
  PlDataTableFiltersWithMeta
           |
           v
    createPTableParams()
      |
      +-- convertPartitionFiltersToFilterSpec(sheetsState) --> partition leaves
      +-- state.filtersState                               --> column filter tree
      +-- createSearchFilterNode(columns, search)          --> search OR-group
      |
      v
    Merge: AND(partitionLeaves..., columnFilterTree, searchOrGroup)
      |
      v
    distillFilterSpec()
      |
      v
    PTableParamsV2.filters: null | PlDataTableFilters
      |
      v
    createPlDataTableV3() --> PFrame driver (server-side filtering)
```

---

## Edge Cases

| Condition                                                             | Behavior                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `filtersState` in cache is `null` or malformed                        | Default empty root returned: `{ id: randomInt(), type: "and", isExpanded: true, filters: [] }`                                |
| `sourceId` is `null`                                                  | `filtersState` setter is a no-op (guard: `if (oldState.sourceId)`). Filter panel still renders but changes are not persisted. |
| `pframeHandle` is `nil`                                               | `handleSuggestOptions` logs a warning and returns `[]`. Filter still usable with manual input.                                |
| Column filter `columnId.type` is not `"column"` in suggestion handler | Throws: `"ColumnId should be of type 'column' for suggest options"`                                                           |
| All filter leaves are unfilled after distillation                     | `distillFilterSpec` returns `null`. `PTableParamsV2.filters` is `null`. No filtering applied.                                 |
| Search string is empty or whitespace-only                             | `createSearchFilterNode` returns `null`. Search filter is excluded from merge.                                                |
| Search string is numeric but no numeric columns exist                 | Only string `patternEquals` leaves generated. Numeric branch skipped.                                                         |
| Search string is non-numeric                                          | Only string columns produce search leaves. Numeric columns skipped.                                                           |
| `disableFiltersPanel` prop on `PlAgDataTableV2`                       | `PlTableFiltersV2` not rendered. `filtersState` still exists in state and participates in `createPTableParams`.               |

---

## Reactivity Chain

```
User edits filter in PlAdvancedFilterComponent
  --> PlTableFiltersV2 v-model emits update
    --> filtersStateDeepReactive.value updated
      --> deep watcher fires
        --> filtersState.value = newValue (computed setter)
          --> tableState.value setter
            --> createPTableParams() called
              --> distillFilterSpec() produces clean filters
            --> tableStateNormalized.value updated (debounced 300ms)
              --> tableStateDenormalized.value written (persisted by parent)
```

Mutations within nested filter nodes (e.g., changing a leaf's value) are detected by the deep watcher on `filtersStateDeepReactive`, ensuring the full chain fires without requiring the root reference to change.
