# State Persistence: Technical Specification

## Overview

State persistence stores UI state (column order, sort, visibility, sheet selection, filters, search)
per data source (`sourceId`). Uses LRU cache (depth 5) with debounced writes (300ms).

Entry point: `useTableState()` in `sources/table-state-v2.ts`.
Consumer: `PlAgDataTableV2.vue` — binds returned `WritableComputedRef`-s to ag-grid and sub-components.

---

## Data Structures

**`PlDataTableStateV2`** (`@platforma-sdk/model`, `state-migration.ts`)
Union of all historical versions (v1–v5). Persisted by the parent component (e.g. block state).
Upgraded to `PlDataTableStateV2Normalized` on read via `upgradePlDataTableStateV2()`.

**`PlDataTableStateV2Normalized`** (`@platforma-sdk/model`, `typesV5.ts`)

```
{
  version: 5
  stateCache: PlDataTableStateV2CacheEntry[]   // LRU, max 5 entries
  pTableParams: PTableParamsV2                  // derived, used by data pipeline
}
```

**`PlDataTableStateV2CacheEntry`** (`@platforma-sdk/model`, `typesV5.ts`)

```
{
  sourceId: string
  gridState: PlDataTableGridStateCore
  sheetsState: PlDataTableSheetState[]
  filtersState: null | PlDataTableFiltersWithMeta
  searchString?: string
}
```

**`PlDataTableGridStateCore`** (`@platforma-sdk/model`, `typesV5.ts`)
Subset of ag-grid `GridState`, typed with `PlTableColumnIdJson`:

```
{
  columnOrder?:      { orderedColIds: PlTableColumnIdJson[] }
  sort?:             { sortModel: { colId: PlTableColumnIdJson, sort: "asc" | "desc" }[] }
  columnVisibility?: { hiddenColIds: PlTableColumnIdJson[] }
}
```

**`PlDataTableSheetState`** (`@platforma-sdk/model`, `typesV5.ts`)

```
{
  axisId: AxisId
  value: string | number
}
```

**`PTableParamsV2`** (`@platforma-sdk/model`, `typesV5.ts`)
Derived from cache entry. Consumed by `calculateGridOptions()` to build server request.

```
| { sourceId: null,   hiddenColIds: null,                    filters: null,                       sorting: [] }
| { sourceId: string, hiddenColIds: null | PTableColumnId[], filters: null | PlDataTableFilters,  sorting: PTableSorting[] }
```

---

## Layered Computed Architecture

`useTableState()` constructs a 3-layer computed chain:

### Layer 1: `tableStateNormalized` (`computedCached`)

- **get**: calls `upgradePlDataTableStateV2(tableStateDenormalized.value)` — migrates v1–v4 to v5.
- **set**: debounced (300ms) write to `tableStateDenormalized` (the v-model ref from parent).

### Layer 2: `tableState` (`computed`)

- **get**: looks up cache entry by `settings.value.sourceId`.
  - If `sourceId` is `null` and error state is `undefined` — returns default empty state.
  - Otherwise picks `sourceId` or falls back to the last entry in `stateCache`.
  - If no cache hit — returns default state with `sourceId` set.
- **set**: receives a `PlDataTableStateV2CacheEntry` (or nullable variant).
  - Calls `createPTableParams(state, columns)` to derive `PTableParamsV2`.
  - Removes existing entry for same `sourceId` from cache (dedup).
  - Pushes new entry, trims to last 5 (`stateCache.slice(-CacheDepth)`).
  - Writes only if result differs from current (`isJsonEqual` check).

### Layer 3: per-field refs (`computed` with get/set)

Each writes back to Layer 2 by spreading old state + new field value:

| Ref            | Field in cache entry | Guard                              |
| -------------- | -------------------- | ---------------------------------- |
| `gridState`    | `gridState`          | skips write if `sourceId === null` |
| `sheetsState`  | `sheetsState`        | skips write if `sourceId === null` |
| `filtersState` | `filtersState`       | skips write if `sourceId === null` |
| `searchString` | `searchString`       | skips write if `sourceId === null` |

Special case: `filtersState` is wrapped in `ref()` + deep `watch()` to propagate
in-place mutations of the filter tree (added/removed leaves, group edits).

---

## Write Trigger Sources

| Source                        | Target ref     | Trigger                                         |
| ----------------------------- | -------------- | ----------------------------------------------- |
| ag-grid `onStateUpdated`      | `gridState`    | sort, column reorder, column hide/show          |
| ag-grid `onGridPreDestroyed`  | `gridState`    | captures state before ag-grid unmounts (reload) |
| `PlAgDataTableSheets` v-model | `sheetsState`  | user changes partition dropdown                 |
| `PlTableFiltersV2` v-model    | `filtersState` | user adds/removes/edits filter nodes            |
| `PlTableFastSearch` v-model   | `searchString` | user types in search input                      |

---

## PTableParamsV2 Derivation (`createPTableParams`)

Called on every Layer 2 setter invocation.

1. **Search filter**: `createSearchFilterNode(columns, searchString)`
   - For each column in `visibleFilterableColumns`:
     - String type → `{ type: "patternEquals", column, value: trimmed }`
     - Numeric type (and input is valid number) → `{ type: "equal", column, x: numericValue }`
   - Combined with `{ type: "or" }`.

2. **Partition filters**: `convertPartitionFiltersToFilterSpec(sheetsState)`
   - For each sheet: `patternEquals` for string values, `equal` for numbers.

3. **Column filters**: `filtersState` (tree structure: AND/OR groups of leaf filters).

4. **Merge**: all non-null parts joined under `{ type: "and" }`, then `distillFilterSpec()`.

5. **Sorting**: `convertAgSortingToPTableSorting(gridState.sort)`
   - Maps ag-grid `sortModel` entries → `{ column, ascending, naAndAbsentAreLeastValues }`.
   - Column id: `parseJson(colId).labeled` with `spec` field stripped.

6. **Hidden columns**: `getHiddenColIds(gridState.columnVisibility)`
   - Maps `hiddenColIds` JSON strings → `PTableColumnId` via `parseJson(json).source`.

Result: `{ sourceId, hiddenColIds, filters, sorting }`.

---

## Column Visibility Normalization

ag-grid returns `columnVisibility: undefined` when all columns are visible.
`normalizeColumnVisibility()` (in `PlAgDataTableV2.vue`) resolves ambiguity:

| Previous state                  | ag-grid returns `undefined` | Result                                               |
| ------------------------------- | --------------------------- | ---------------------------------------------------- |
| Had explicit `columnVisibility` | yes                         | `{ hiddenColIds: [] }` — user showed all             |
| No previous `columnVisibility`  | yes                         | Compute defaults from `isColumnOptional` annotations |
| —                               | no (has `hiddenColIds`)     | Pass through unchanged                               |

Called from both `onStateUpdated` and `onGridPreDestroyed`.

---

## Grid State Reload (External State Restore)

Watcher in `PlAgDataTableV2.vue` monitors `[gridApi, gridState]`:

1. Compares `gridState` with `gridApi.getState()` (normalized: empty `hiddenColIds` treated as `undefined`).
2. If different → sets `isReloading = true`, increments `reloadKey`.
3. `reloadKey` is `:key` on `AgGridVue` → forces re-mount with `initialState = gridState`.
4. `isReloading` flag prevents `onGridPreDestroyed` from overwriting state during teardown.
5. `isReloading` reset to `false` on `nextTick`.

---

## LRU Cache Behavior

- Max depth: 5 entries.
- On write: existing entry for `sourceId` is removed (`findIndex` + `splice`), new entry pushed to end.
- Trim: `stateCache.slice(-CacheDepth)` — oldest entries evicted.
- On read with no `sourceId`: falls back to `stateCache.at(-1)` (most recent entry).

---

## Version Migration

`upgradePlDataTableStateV2()` handles all historical formats:

| From | To  | Strategy                                                          |
| ---- | --- | ----------------------------------------------------------------- |
| v1   | v5  | Non-upgradeable (sourceId algorithm changed) → reset to default   |
| v2   | v3  | Add empty `filtersState: []` to each cache entry                  |
| v3   | v5  | Non-upgradeable (column id algorithm changed) → reset to default  |
| v4   | v5  | Migrate per-column filters to tree-based format (`migrateV4toV5`) |

Default state:

```
{
  version: 5,
  stateCache: [],
  pTableParams: { sourceId: null, hiddenColIds: null, filters: null, sorting: [] }
}
```
