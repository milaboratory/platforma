# Column Visibility Normalization: Technical Specification

## Problem Statement

ag-grid represents "all columns visible" as `columnVisibility: undefined` in its `GridState`.
This creates ambiguity: `undefined` can mean either "no visibility state has been set yet"
(initial load, defaults should apply) or "user explicitly made all columns visible"
(empty hidden list should be persisted). Without normalization, toggling all columns
visible would cause optional columns to re-hide on next state restore.

---

## Annotation Source: `isColumnOptional`

Defined in `sdk/model/src/components/PlDataTable/createPlDataTable/utils.ts`.

```ts
function isColumnOptional(spec: { annotations?: Annotation }): boolean;
```

Returns `true` when `Annotation.Table.Visibility` equals `"optional"` on the column spec.

Three visibility annotation values exist:

| Annotation Value | Meaning                          | Effect on Default Visibility |
| ---------------- | -------------------------------- | ---------------------------- |
| (absent)         | Normal column                    | Visible                      |
| `"optional"`     | Hidden by default, user can show | Hidden                       |
| `"hidden"`       | Excluded from table entirely     | Excluded (never in ColDefs)  |

`"hidden"` columns are filtered out earlier in `calculateGridOptions` and never reach
the visibility normalization layer. Only `"optional"` columns participate in default hiding.

---

## Core Types

Defined in `sdk/model/src/components/PlDataTable/typesV5.ts`:

```ts
type PlDataTableGridStateCore = {
  columnOrder?: { orderedColIds: PlTableColumnIdJson[] };
  sort?: { sortModel: { colId: PlTableColumnIdJson; sort: "asc" | "desc" }[] };
  columnVisibility?: { hiddenColIds: PlTableColumnIdJson[] };
};
```

`columnVisibility` has three semantic states:

| Runtime Value                  | Semantic Meaning                           |
| ------------------------------ | ------------------------------------------ |
| `undefined`                    | Ambiguous (raw ag-grid output)             |
| `{ hiddenColIds: [] }`         | Explicitly all visible (no columns hidden) |
| `{ hiddenColIds: [id1, ...] }` | Specific columns hidden                    |

---

## Normalization Function

File: `PlAgDataTableV2.vue`, lines 212-232.

```ts
function normalizeColumnVisibility(
  partialState: PlDataTableGridStateCore,
  prevState: PlDataTableGridStateCore,
  api: GridApi<PlAgDataTableV2Row>,
): PlDataTableGridStateCore;
```

### Parameters

| Parameter      | Type                          | Description                                                 |
| -------------- | ----------------------------- | ----------------------------------------------------------- |
| `partialState` | `PlDataTableGridStateCore`    | Current state extracted from ag-grid via `makePartialState` |
| `prevState`    | `PlDataTableGridStateCore`    | Previously stored `gridState` value                         |
| `api`          | `GridApi<PlAgDataTableV2Row>` | Live ag-grid API for querying column definitions            |

### Decision Logic

```
if partialState.columnVisibility !== undefined
  -> return partialState (explicit value, no normalization needed)

if prevState.columnVisibility !== undefined
  -> return { ...partialState, columnVisibility: { hiddenColIds: [] } }
     (had explicit state before; ag-grid returning undefined means user made all visible)

else (no previous explicit state)
  -> compute defaults via getDefaultHiddenColIds(api)
     if defaults.length > 0
       -> return { ...partialState, columnVisibility: { hiddenColIds: defaults } }
     else
       -> return partialState (no optional columns exist, leave as undefined)
```

### Decision Table

| `partialState.columnVisibility` | `prevState.columnVisibility` | Result                                               |
| ------------------------------- | ---------------------------- | ---------------------------------------------------- |
| Defined (has `hiddenColIds`)    | (any)                        | Pass through unchanged                               |
| `undefined`                     | Defined (any value)          | `{ hiddenColIds: [] }` -- user showed all columns    |
| `undefined`                     | `undefined`                  | Compute defaults from `isColumnOptional` annotations |

---

## Default Hidden Column Computation

File: `PlAgDataTableV2.vue`, lines 234-244.

```ts
function getDefaultHiddenColIds(api: GridApi<PlAgDataTableV2Row>): PlTableColumnIdJson[];
```

1. Calls `api.getAllGridColumns()` to get all registered column objects.
2. Filters to columns where:
   - `col.getColDef().context` is a `PTableColumnSpec`
   - `spec.type === "column"` (axes are never optional)
   - `isColumnOptional(spec.spec)` returns `true`
3. Maps matching columns to their `colId` (cast to `PlTableColumnIdJson`).

This function is only called on first state materialization (no previous explicit visibility).
It reads the live column definitions that were already built by `calculateGridOptions`.

---

## Call Sites

Both call sites apply identical normalization and write the result to the same targets.

### `onStateUpdated` (line 143)

Triggered by: any ag-grid state change (sort, column reorder, column hide/show, column resize).

```ts
gridOptions.value.onStateUpdated = (event) => {
  const partialState = normalizeColumnVisibility(
    makePartialState(event.state),
    gridState.value,
    event.api,
  );
  gridOptions.value.initialState = gridState.value = partialState;
  // ... auto-sizing logic follows
};
```

### `onGridPreDestroyed` (line 130)

Triggered by: ag-grid unmounting (happens during `reloadKey` increment or component teardown).

```ts
gridOptions.value.onGridPreDestroyed = (event) => {
  if (!isReloading) {
    gridOptions.value.initialState = gridState.value = normalizeColumnVisibility(
      makePartialState(event.api.getState()),
      gridState.value,
      event.api,
    );
  }
  gridApi.value = null;
};
```

Guard: `isReloading` flag prevents state capture during programmatic re-mounts (external state restore).

### Write Targets

Both handlers write the normalized state to two locations:

| Target                           | Purpose                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- |
| `gridState.value`                | Persisted state (flows to `useTableState` -> LRU cache -> `PTableParamsV2`) |
| `gridOptions.value.initialState` | Used when ag-grid re-mounts with same key                                   |

---

## Downstream Consumers

### State Persistence Layer (`table-state-v2.ts`)

`getHiddenColIds(gridState.columnVisibility)` extracts `PTableColumnId[]` from the normalized state
for inclusion in `PTableParamsV2.hiddenColIds`. This feeds into the model layer
(`createPlDataTableV2` / `createPlDataTableV3`) to build separate `fullTableHandle` and
`visibleTableHandle` PTable definitions.

### Grid Options Calculation (`table-source-v2.ts`)

`calculateGridOptions` receives `hiddenColIds` from `gridState.value.columnVisibility?.hiddenColIds`.

Two uses:

1. **Fallback default computation** (lines 195-204): if `hiddenColIds` is `nil` (which only
   happens when `columnVisibility` itself is `undefined`), it computes defaults from
   `isColumnOptional` annotations. This is a parallel default path to the one in
   `normalizeColumnVisibility` / `getDefaultHiddenColIds`, operating on table specs rather
   than live ag-grid column objects.
2. **ColDef `hide` property** (line 364): `makeColDef` sets
   `hide: hiddenColIds !== undefined && hiddenColIds.includes(colId)`.

### Reload Comparison (`stateForReloadCompare`, line 247)

Normalizes for comparison: both `undefined` and `{ hiddenColIds: [] }` are treated as equivalent
(mapped to `undefined`). This prevents spurious re-mounts when the only difference is the
representation of "all visible".

```ts
function stateForReloadCompare(state: PlDataTableGridStateCore): PlDataTableGridStateCore {
  const cv = state.columnVisibility;
  const normalizedCv = !cv || cv.hiddenColIds.length === 0 ? undefined : state.columnVisibility;
  return { ...state, columnVisibility: normalizedCv };
}
```

---

## Data Flow Diagram

```
ag-grid fires onStateUpdated / onGridPreDestroyed
  |
  v
makePartialState(event.state)  -->  PlDataTableGridStateCore (columnVisibility may be undefined)
  |
  v
normalizeColumnVisibility(partialState, prevState, api)
  |
  +-- partialState.columnVisibility defined?
  |     YES -> return as-is
  |     NO  -> prevState.columnVisibility defined?
  |              YES -> { hiddenColIds: [] }  (user made all visible)
  |              NO  -> getDefaultHiddenColIds(api)
  |                       returns optional column IDs from annotations
  |                       if non-empty -> { hiddenColIds: [defaults] }
  |                       if empty     -> leave undefined
  |
  v
gridState.value = normalized state
  |
  +---> useTableState setter
  |       |
  |       v
  |     createPTableParams()
  |       |
  |       v
  |     getHiddenColIds(columnVisibility) --> PTableParamsV2.hiddenColIds
  |       |
  |       v
  |     Model layer: builds visibleTableHandle excluding hidden columns
  |
  +---> calculateGridOptions({ hiddenColIds: columnVisibility?.hiddenColIds })
          |
          v
        makeColDef(..., hiddenColIds) --> ColDef.hide = hiddenColIds.includes(colId)
```

---

## Edge Cases

| Scenario                                          | Behavior                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| First load, no cached state, no optional columns  | `columnVisibility` stays `undefined` throughout                                   |
| First load, no cached state, has optional columns | `normalizeColumnVisibility` sets `hiddenColIds` to optional col IDs               |
| User hides a column, then shows all               | ag-grid returns `undefined`; previous state was defined -> `{ hiddenColIds: [] }` |
| External state restore (server push)              | `isReloading` flag prevents `onGridPreDestroyed` from overwriting                 |
| Grid re-mount with `{ hiddenColIds: [] }`         | `stateForReloadCompare` treats this as equivalent to `undefined`                  |
| Column set changes (new optional columns added)   | `calculateGridOptions` fallback re-computes defaults if `hiddenColIds` is `nil`   |

---

## File References

| File                         | Relevant Lines | Contents                                                   |
| ---------------------------- | -------------- | ---------------------------------------------------------- |
| `PlAgDataTableV2.vue`        | 130-138        | `onGridPreDestroyed` handler                               |
| `PlAgDataTableV2.vue`        | 143-158        | `onStateUpdated` handler                                   |
| `PlAgDataTableV2.vue`        | 184-205        | `makePartialState`                                         |
| `PlAgDataTableV2.vue`        | 212-232        | `normalizeColumnVisibility`                                |
| `PlAgDataTableV2.vue`        | 234-244        | `getDefaultHiddenColIds`                                   |
| `PlAgDataTableV2.vue`        | 246-251        | `stateForReloadCompare`                                    |
| `sources/table-source-v2.ts` | 85-101         | `calculateGridOptions` signature (accepts `hiddenColIds`)  |
| `sources/table-source-v2.ts` | 194-204        | Fallback default computation from annotations              |
| `sources/table-source-v2.ts` | 332-364        | `makeColDef` — sets `ColDef.hide`                          |
| `sources/table-state-v2.ts`  | 180-183        | `getHiddenColIds` — extracts `PTableColumnId[]` from state |
| `createPlDataTable/utils.ts` | 25-27          | `isColumnOptional` definition                              |
| `typesV5.ts`                 | 25-46          | `PlDataTableGridStateCore` type definition                 |
