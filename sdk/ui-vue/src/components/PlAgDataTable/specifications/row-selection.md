# Row Selection

Server-side multi-row selection via ag-grid `serverSide` row model. Selection is opt-in: enabled when the `selection` v-model is provided (non-`undefined`). Row identity is a composite primary key (`PTableKey`) serialized to canonical JSON.

Source files:

- `PlAgDataTableV2.vue` -- `onSelectionChanged` handler, `updateSelection` controller method, selection remapping in settings watcher.
- `compositions/useGrid.ts` -- ag-grid selection configuration, `onSelectionChanged` callback.
- `types.ts` -- `PlAgDataTableV2Controller`, `PlTableRowId`, `PlTableRowIdJson`, `PlAgDataTableV2Row`.
- `../../PlAgRowNumCheckbox/PlAgRowNumCheckbox.vue` -- per-row checkbox cell renderer.
- `../../PlAgRowNumHeader.vue` -- header checkbox (select-all / deselect-all).
- `../../AgGridVue/selection.ts` -- helper functions: `selectAll`, `deselectAll`, `getSelectedRowsCount`, `isSelectionEnabled`.
- `../sources/row-number.ts` -- row number column definition binding `PlAgRowNumCheckbox` as `cellRenderer`.

---

## Types

| Type                        | Definition                                                                 | Location                                       |
| --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| `PlSelectionModel`          | `{ axesSpec: AxesSpec; selectedKeys: PTableKey[] }`                        | `@platforma-sdk/model` (`PlSelectionModel.ts`) |
| `PTableKey`                 | `(PTableValueAxis \| null)[]`                                              | `@platforma-sdk/model` (`PlSelectionModel.ts`) |
| `AxesSpec`                  | `AxisSpec[]` (from `@milaboratories/pl-model-common`)                      | re-exported by `@platforma-sdk/model`          |
| `AxisId`                    | Axis identifier (name + type)                                              | `@platforma-sdk/model`                         |
| `PlTableRowId`              | Alias for `PTableKey`                                                      | `types.ts`                                     |
| `PlTableRowIdJson`          | `CanonicalizedJson<PTableKey>` -- deterministic JSON string of `PTableKey` | `types.ts`                                     |
| `PlAgDataTableV2Controller` | `{ focusRow, updateSelection }`                                            | `types.ts`                                     |

`AxesSpec` describes the axis order and types for a given table. `selectedKeys` values are parallel arrays: `selectedKeys[i][j]` is the value on axis `axesSpec[j]` for the i-th selected row.

`createPlSelectionModel()` returns `{ axesSpec: [], selectedKeys: [] }` (empty selection).

---

## Activation condition

Selection mode is determined once in `useGrid()` at grid construction time, based on whether the `selection` ref holds a value:

```
cellSelection: isNil(selection.value)
rowSelection: selection.value ? { mode: "multiRow", ... } : undefined
```

| `selection` ref        | `rowSelection`              | `cellSelection` | Result                                                  |
| ---------------------- | --------------------------- | --------------- | ------------------------------------------------------- |
| `undefined`            | `undefined`                 | `true`          | Range/cell selection (spreadsheet mode). No checkboxes. |
| Any `PlSelectionModel` | `{ mode: "multiRow", ... }` | `false`         | Multi-row selection with checkboxes.                    |

`rowSelection` config:

| Property               | Value        | Meaning                                                                              |
| ---------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `mode`                 | `"multiRow"` | Multiple rows selectable simultaneously.                                             |
| `selectAll`            | `"all"`      | Header checkbox targets all rows, not just current page.                             |
| `groupSelects`         | `"self"`     | Group row selection does not cascade to children.                                    |
| `checkboxes`           | `false`      | ag-grid built-in checkbox column disabled; custom `PlAgRowNumCheckbox` used instead. |
| `headerCheckbox`       | `false`      | ag-grid built-in header checkbox disabled; custom `PlAgRowNumHeader` used instead.   |
| `enableClickSelection` | `false`      | Clicking a row does not toggle selection; only explicit checkbox interaction does.   |

---

## Row identity and selection state storage

Each row has a unique `id: PlTableRowIdJson` computed as `canonicalizeJson(axesKey)`, where `axesKey: PTableKey` is the array of axis values for that row.

ag-grid stores server-side selection as `{ selectAll: boolean, toggledNodes: string[] }`. `toggledNodes` contains row ID strings (`PlTableRowIdJson` values). `selectAll` is always `false` in this implementation -- selected rows are explicitly listed in `toggledNodes`.

---

## UI components

### PlAgRowNumCheckbox (cell renderer)

Rendered in the row-number column for every row. Displays row number by default; shows checkbox on hover or when the row is selected.

Behavior:

1. On mount, reads `node.isSelected()` into local `isChecked` ref.
2. Listens to `rowSelected` event on the row node to keep `isChecked` in sync.
3. On checkbox toggle, calls `node.setSelected(value)` only if `isSelectionEnabled(api)` returns `true`.
4. `forceShowCheckbox` computed: `true` when `isChecked` is `true` OR `isSelectionEnabled(api)` is `true`.

### PlAgRowNumHeader (header component)

Header cell for the row-number column. Shows a select-all checkbox when selection is enabled; shows `#` text otherwise.

Behavior:

1. Tracks `selectedRowCount` and `totalRowCount` via `getSelectedRowsCount(api)` and `getTotalRowsCount(api)`.
2. Listens to `selectionChanged`, `rowDataUpdated`, `modelUpdated` events to update counts.
3. Listens to `stateUpdated` to refresh `isSelectable` flag.
4. Checkbox states: unchecked (0 selected), indeterminate (some selected, not all), checked (all selected).
5. Toggle action: if any rows selected, calls `deselectAll(api)`; otherwise calls `selectAll(api)`.

### selectAll (server-side mode)

Does NOT use ag-grid's native `selectAll` API. Instead iterates all cached nodes via `forEachNode` and calls `node.setSelected(true)` on each. This ensures `toggledNodes` contains explicit row IDs rather than relying on `selectAll: true` flag (which would not expose individual row IDs).

Implication: only rows currently in the cache (up to `cacheBlockSize * maxBlocksInCache = 1000 * 100 = 100,000` rows) can be selected. The `cacheBlockSize` is 1000 to match the `PlMultiSequenceAlignment` limit.

### deselectAll

Calls `setServerSideSelectionState({ selectAll: false, toggledNodes: [] })`.

---

## Data flow: user clicks checkbox

```
PlAgRowNumCheckbox.setSelection(value)
  calls node.setSelected(value)
    |
    v
ag-grid updates internal server-side selection state
  adds/removes node.id (PlTableRowIdJson) in toggledNodes
    |
    v
ag-grid fires "selectionChanged" event
    |
    v
useGrid onSelectionChanged callback
    |
    v
reads state = event.api.getServerSideSelectionState()
  state.toggledNodes: PlTableRowIdJson[]
    |
    v
maps: selectedKeys = toggledNodes.map(nodeId => parseJson(nodeId))
  parseJson deserializes PlTableRowIdJson back to PTableKey
    |
    v
guard: isJsonEqual(selection.value.selectedKeys, selectedKeys)?
  yes -> no-op (avoids redundant reactivity)
  no  -> selection.value = { ...selection.value, selectedKeys }
    |
    v
parent receives updated PlSelectionModel via v-model
```

Key detail: `axesSpec` is NOT updated by `onSelectionChanged`. It is only set/updated by the settings watcher when `calculateGridOptions` produces a new `axesSpec`. The `onSelectionChanged` handler preserves the existing `axesSpec` and only replaces `selectedKeys`.

---

## Data flow: programmatic updateSelection

`controller.updateSelection({ axesSpec, selectedKeys })` exposed via `defineExpose`.

### Algorithm

```
1. await dataRenderedTracker.promise
     returns GridApi once getRows has called success() at least once
     (ensures grid has data and row IDs are meaningful)
   if api.isDestroyed() -> return false

2. read current axes = selection.value.axesSpec
   if axes is undefined OR axes.length !== axesSpec.length -> return false

3. build mapping: caller axis index -> internal axis index
     for each spec in caller's axesSpec:
       id = getAxisId(spec)
       find index in internal axes where matchAxisId(axis, id)
     mapping = [internalIndex0, internalIndex1, ...]

4. validate mapping
     mappingSet = new Set(mapping)
     if mappingSet.has(-1) -> return false  (caller axis not found internally)
     if mappingSet.size !== axesSpec.length -> return false  (duplicate mappings)

5. remap keys: transform caller's key order to internal key order
     selectedNodes = selectedKeys.map(key =>
       canonicalizeJson(mapping.map(index => key[index]))
     )
     each selectedNode is a PlTableRowIdJson string

6. guard: compare old and new
     oldSelectedKeys = api.getServerSideSelectionState().toggledNodes ?? []
     if isJsonEqual(oldSelectedKeys, selectedNodes) -> return true (already matches)

7. apply to ag-grid
     api.setServerSideSelectionState({
       selectAll: false,
       toggledNodes: selectedNodes
     })

8. wait for onSelectionChanged to propagate to v-model
     create an effectScope
     watch(selection, resolve, { once: true })
     await promiseTimeout(promise, 500)
       success -> return true
       timeout -> return false
     finally: scope.stop()
```

### Return values

| Return value | Condition                                                                         |
| ------------ | --------------------------------------------------------------------------------- |
| `true`       | Selection applied and v-model updated.                                            |
| `true`       | Selection already matches (step 6 guard).                                         |
| `false`      | Grid destroyed after awaiting data.                                               |
| `false`      | Current `axesSpec` is undefined or length mismatch.                               |
| `false`      | Caller's axes cannot be mapped to internal axes (missing or duplicate).           |
| `false`      | Timeout: v-model did not update within 500ms after `setServerSideSelectionState`. |

---

## Selection remapping on axesSpec change

When the settings watcher calls `calculateGridOptions` and obtains a new `axesSpec`, the watcher checks whether the axes order changed. If it did, existing selected keys must be remapped to the new order.

Located in the settings watcher, after `gridApi.updateGridOptions(options)`.

### Algorithm

```
if selection.value is defined:
  oldAxesSpec = selection.value.axesSpec
  if not isJsonEqual(oldAxesSpec, axesSpec):
    CASE 1: oldAxesSpec is undefined OR length mismatch
      -> selection.value = { axesSpec, selectedKeys: [] }
      -> setServerSideSelectionState({ selectAll: false, toggledNodes: [] })

    CASE 2: same length, attempt remapping
      mapping = oldAxesSpec
        .map(getAxisId)
        .map(id => axesSpec.findIndex(axis => matchAxisId(axis, id)))
      mappingSet = new Set(mapping)

      if mappingSet.has(-1) OR mappingSet.size !== axesSpec.length:
        -> CASE 1 (clear selection)

      otherwise:
        selectedNodes = oldSelectedKeys.map(key => mapping.map(index => key[index]))
        selection.value = { axesSpec, selectedKeys: selectedNodes }
        setServerSideSelectionState({
          selectAll: false,
          toggledNodes: selectedNodes.map(key => canonicalizeJson(key))
        })
```

Note: selection remapping and `updateSelection` use the same axis-matching logic (`getAxisId` + `matchAxisId` + `Set`-based validation), but the mapping direction is reversed:

- Settings watcher: old axis order -> new axis order.
- `updateSelection`: caller axis order -> current internal axis order.

---

## Selection reset conditions

Selection is reset to `{ axesSpec: [], selectedKeys: [] }` (via `createPlSelectionModel()`) and ag-grid state cleared to `{ selectAll: false, toggledNodes: [] }` in these cases:

| Condition                                 | Location                                                      | Guard                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sourceId` becomes `null`                 | Settings watcher, `sourceId === null` branch                  | Only if `selection.value` is defined and differs from default.                                                     |
| `sourceId` changes to a different value   | Settings watcher, `sourceId !== oldSettings?.sourceId` branch | Only if `selection.value` is defined AND `oldSettings?.sourceId` was non-null (prevents clearing on first render). |
| `axesSpec` changes with incompatible axes | Settings watcher, remapping CASE 1                            | `oldAxesSpec` undefined, length mismatch, or unmappable axes.                                                      |

---

## Serialization round-trip

Selection keys flow through serialization at two boundaries:

1. **Row data -> ag-grid row ID**: `columns2rows` produces `id = canonicalizeJson(axesKey)`. This `PlTableRowIdJson` string is used as the ag-grid row ID (`getRowId: params => params.data.id`).

2. **ag-grid selection state -> PlSelectionModel**: `onSelectionChanged` reads `toggledNodes` (array of `PlTableRowIdJson` strings) and calls `parseJson(nodeId)` to recover `PTableKey[]`.

3. **PlSelectionModel -> ag-grid selection state** (programmatic): `updateSelection` takes `PTableKey[]`, applies axis remapping, then calls `canonicalizeJson` to produce `PlTableRowIdJson` strings for `toggledNodes`.

`canonicalizeJson` produces deterministic JSON (keys sorted, no whitespace), ensuring that the same logical key always maps to the same string regardless of property insertion order.

---

## Concurrency and timing

| Mechanism                                                   | Purpose                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataRenderedTracker` (`DeferredCircular<GridApi>`)         | `updateSelection` awaits this before acting. Resolved by `getRows` on first successful data load. Reset by settings watcher on new data source. Prevents selection operations on an empty or stale grid.                                                                                                  |
| `effectScope` + `watch(selection, resolve, { once: true })` | In `updateSelection`, waits for `onSelectionChanged` to propagate the ag-grid state change back to the Vue `selection` ref. Scope is stopped in `finally` to prevent leaks.                                                                                                                               |
| `promiseTimeout(promise, 500)`                              | 500ms timeout on the watch. If `onSelectionChanged` does not fire (e.g., grid destroyed mid-operation, or selection was already at the target state but `isJsonEqual` check in step 6 missed it), the timeout catches it and returns `false`.                                                             |
| `generation` ref                                            | Settings watcher increments `generation` before calling `calculateGridOptions`. Stale callbacks (from a previous settings change) compare captured `stateGeneration` against current `generation.value` and abort on mismatch. Prevents selection remapping from an outdated `calculateGridOptions` call. |
| `isJsonEqual` guards                                        | Both `onSelectionChanged` and the settings watcher compare old vs. new selection values before writing. Prevents infinite reactivity loops (selection write -> event -> re-write).                                                                                                                        |
