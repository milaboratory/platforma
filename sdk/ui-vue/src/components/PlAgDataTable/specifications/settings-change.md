# Data Flow: Settings Change -- Technical Specification

## Overview

The settings-change watcher is the central orchestration point of `PlAgDataTableV2`.
It reacts to changes in `PlDataTableSettingsV2` (and `gridApi` initialization) and
drives the grid through a state machine with four branches: no source, source changed,
model not ready, model ready.

Entry point: `watch(() => [gridApi.value, settings.value], ...)` in `PlAgDataTableV2.vue` (lines 338-492).

Primary async dependency: `calculateGridOptions()` in `sources/table-source-v2.ts`.

---

## Data Structures

**`PlDataTableSettingsV2`** (discriminated union)

| Variant    | Fields                                                                                   | Meaning                                            |
| ---------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| No source  | `{ sourceId: null, pending: boolean, error: null \| ErrorLike[] }`                       | Block output absent or errored                     |
| Has source | `{ sourceId: string, sheets: PlDataTableSheet[], model: PlDataTableModel \| undefined }` | Data source identified; model may still be loading |

**`PlDataTableModel`**

| Field                | Type             | Purpose                                                              |
| -------------------- | ---------------- | -------------------------------------------------------------------- |
| `sourceId`           | `string \| null` | Identifies which computation produced this model                     |
| `fullTableHandle`    | `PTableHandle`   | All columns including hidden -- used for column specs                |
| `visibleTableHandle` | `PTableHandle`   | Columns after server-side hide/sort/filter -- used for data fetching |
| `fullPframeHandle`   | `PFrameHandle`   | For filter metadata queries                                          |

**`PlSelectionModel`**

| Field          | Type          | Purpose                                                          |
| -------------- | ------------- | ---------------------------------------------------------------- |
| `axesSpec`     | `AxesSpec`    | Axis specs defining the order/identity of axes in `selectedKeys` |
| `selectedKeys` | `PTableKey[]` | Row keys (arrays of axis values) of selected rows                |

Default (empty) selection: `{ axesSpec: [], selectedKeys: [] }`.

**`generation`** (`Ref<number>`)

Monotonically increasing counter. Incremented on every watcher invocation. Used to
invalidate stale async operations (`calculateGridOptions` and its inner datasource
closures both capture `stateGeneration` and bail out when it no longer matches
`generation.value`).

**`oldSettings`** (`PlDataTableSettingsV2 | null`)

Mutable closure variable. Stores the previous settings value. Used to detect
`sourceId` changes and to skip false watch triggers.

**`dataRenderedTracker`** (`DeferredCircular<GridApi>`)

Resettable deferred. Reset on every watcher run. Resolved inside the datasource's
`getRows()` after the first successful page load. Consumed by the
`newDataRendered` emit and by `focusRow` / `updateSelection` controller methods.

---

## Step-by-Step Flow

### 0. Guard checks

| Check                                | Action                               |
| ------------------------------------ | ------------------------------------ |
| `gridApi` is null or destroyed       | Return (wait for ag-grid init)       |
| `isJsonEqual(settings, oldSettings)` | Return (skip false reactive trigger) |

If guards pass:

1. Increment `generation.value`.
2. Call `gridApi.hideOverlay()` (required so loading overlay can be shown; ag-grid ignores `loading=true` if no-rows overlay is active).
3. Call `dataRenderedTracker.reset()`.

### 1. Branch: No data source (`sourceId === null`)

**Condition:** `settings.sourceId === null`.

**Actions:**

| Step              | Detail                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show overlay      | `loading: true`, variant = `settings.pending ? "running" : "not-ready"`                                                                                                               |
| Clear column defs | `columnDefs: undefined`                                                                                                                                                               |
| Clear datasource  | `serverSideDatasource: undefined`                                                                                                                                                     |
| Clear selection   | If `selection.value` exists and differs from default, set `selection.value = createPlSelectionModel()` and call `setServerSideSelectionState({ selectAll: false, toggledNodes: [] })` |

**Returns** immediately (no further processing).

### 2. Branch: Source changed (`sourceId !== oldSettings?.sourceId`)

**Condition:** `settings.sourceId !== oldSettings?.sourceId` (includes first run when `oldSettings` is null).

**Actions:**

| Step            | Detail                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Show overlay    | `loading: true`, variant = `"loading"`                                                                                                |
| Clear selection | Only if `selection.value` exists AND `oldSettings?.sourceId` is truthy (avoids clearing on initial load). Same mechanism as branch 1. |

**Does not return** -- falls through to branch 3 or 4.

### 3. Branch: Model not ready

**Condition:** `!settings.model` OR `settings.model.sourceId` is truthy and differs from `settings.sourceId`.

The second sub-condition handles the race where the model object still belongs to
a previous computation (its `sourceId` has not caught up with the new `settings.sourceId`).

**Actions:**

| Step                        | Detail                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve row count          | Read `gridApi.getServerSideGroupLevelState()`. If source did not change and state has entries, use `state[0].rowCount`; otherwise default to `1`.                       |
| Install skeleton datasource | `serverSideDatasource.getRows` returns `params.success({ rowData: [], rowCount })`. This causes ag-grid to render skeleton/placeholder rows with the correct row count. |

**Returns** immediately.

### 4. Branch: Model ready

**Condition:** All previous branches did not return; `settings.model` is defined and matches `settings.sourceId`.

This branch is async. It captures `stateGeneration = generation.value` before
entering the promise chain.

#### 4a. calculateGridOptions()

Called with:

| Parameter              | Source                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `generation`           | The `Ref<number>` (for staleness checks inside)                                                        |
| `pfDriver`             | `getRawPlatformaInstance().pFrameDriver`                                                               |
| `model`                | `settings.model`                                                                                       |
| `sheets`               | `settings.sheets ?? []`                                                                                |
| `dataRenderedTracker`  | The shared `DeferredCircular` instance                                                                 |
| `hiddenColIds`         | `gridState.value.columnVisibility?.hiddenColIds`                                                       |
| `cellButtonAxisParams` | Assembled from props: `showCellButtonForAxisId`, `cellButtonInvokeRowsOnDoubleClick`, trigger callback |

Returns `Promise<{ axesSpec, columnDefs, serverSideDatasource }>`.

See "calculateGridOptions internals" section below for details.

#### 4b. Apply grid options (`.then`)

**Staleness guard:** If `gridApi.isDestroyed()` or `stateGeneration !== generation.value`, return without applying.

Call `gridApi.updateGridOptions({ columnDefs, serverSideDatasource })`.

#### 4c. Selection remapping

Executed only when `selection.value` is defined.

Compares `oldAxesSpec` (from current selection) with `axesSpec` (from calculateGridOptions result).

| Condition                                    | Action                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `axesSpec` unchanged (`isJsonEqual`)         | No-op                                                                                                                                                                                                                                                                                                   |
| `oldAxesSpec` is undefined OR length differs | Reset selection to `{ axesSpec, selectedKeys: [] }`, clear toggledNodes                                                                                                                                                                                                                                 |
| Same length, mappable                        | Build index mapping: for each old axis, find its position in new axes via `matchAxisId`. If any axis maps to -1 or mapping is not bijective, reset selection. Otherwise remap each key by reordering its elements according to the mapping, update `selection.value` and `setServerSideSelectionState`. |

**Remapping algorithm:**

```
mapping = oldAxesSpec.map(getAxisId).map(id => axesSpec.findIndex(matchAxisId(id)))

For each oldKey in selectedKeys:
  newKey = mapping.map(index => oldKey[index])
```

#### 4d. Error handling (`.catch`)

**Staleness guard:** same as 4b.

Silently ignores `AbortError` (from cancelled PFrame requests).
Logs other errors via `console.trace`.

#### 4e. Finalize (`.finally`)

**Staleness guard:** same as 4b.

Sets `loading: false`. This reveals the data (or triggers no-rows overlay if row count is 0, handled inside the datasource).

#### 4f. newDataRendered emission

Runs in parallel with the promise chain:
`dataRenderedTracker.promise.then(() => emit("newDataRendered"))`.

The tracker is resolved inside the datasource's `getRows()` after the first
successful `params.success()` call.

### 5. Cleanup (`finally` block of try)

`oldSettings = settings` -- always executes, including on early returns.

---

## calculateGridOptions Internals

### Spec fetching

Fetches `fullTableHandle` and `visibleTableHandle` specs in parallel via `Promise.all`.
Checks generation after await; throws if stale.

### Spec-to-visible mapping

Builds `specsToVisibleSpecsMapping: Map<number, number>` mapping each full-table spec
index to its position in the visible-table specs (or -1 if hidden by server-side filters).

### Column filtering

Excludes from display:

| Excluded type                     | Reason                          |
| --------------------------------- | ------------------------------- |
| Partitioned axes                  | Handled by sheet dropdowns      |
| Label columns                     | Merged into the axis they label |
| Hidden columns (`isColumnHidden`) | Annotated as permanently hidden |
| Linker columns (`isLinkerColumn`) | Internal join metadata          |

Label columns are tracked separately so they can replace their target axis in the
display (axis column shows the label value instead of the raw key).

### Column ordering

1. Axes before columns.
2. Within columns: descending `OrderPriority` annotation value (default 0).

### Default hidden columns

When `hiddenColIds` is `undefined` (no persisted grid state), columns with
`isColumnOptional` annotation are hidden by default. The resulting list of
`PlTableColumnIdJson` values is passed to `makeColDef` which sets `hide: true`.

### ColDef construction

For each field index, `makeColDef()` produces an ag-grid `ColDef` with:

| Property               | Source                                                              |
| ---------------------- | ------------------------------------------------------------------- |
| `colId`                | `canonicalizeJson({ source: spec, labeled: labeledSpec })`          |
| `field`                | String index into `PlAgDataTableV2Row` (`"0"`, `"1"`, ...)          |
| `headerName`           | `pl7.app/label` annotation, fallback `"Unlabeled {type} {index}"`   |
| `lockPosition`         | `true` for axis columns                                             |
| `hide`                 | `true` if `colId` is in `hiddenColIds`                              |
| `valueFormatter`       | From `getColumnRenderingSpec()` (d3-format annotation)              |
| `cellStyle`            | `fontFamily` from annotation (monospace maps to `Spline Sans Mono`) |
| `headerComponent`      | `PlAgColumnHeader` with type (Number/Text) and tooltip              |
| `cellRendererSelector` | `PlAgTextAndButtonCell` for the configured cell-button axis         |
| `cellDataType`         | `"number"` or `"text"` based on `ValueType`                         |

A row-number column (`makeRowNumberColDef()`) is always prepended.

### Datasource construction

The returned `serverSideDatasource.getRows()` closure captures:

| Captured variable          | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `stateGeneration`          | Staleness check                                                  |
| `model.visibleTableHandle` | Data source handle                                               |
| `requestIndices`           | Which columns to fetch (visible fields + axes)                   |
| `fields`                   | Column index list for row construction                           |
| `fieldResultMapping`       | Maps field index to position in response (or -1)                 |
| `axesResultIndices`        | Positions of axis columns in response                            |
| `rowCount`                 | Cached after first `getShape()` call; -1 means "not yet fetched" |

Per-page fetch flow:

1. First call: `getShape(visibleTableHandle)` to get total row count.
2. If `rowCount === 0`: call `params.success({ rowData: [], rowCount: 0 })`, hide loading overlay, show no-rows overlay. Return.
3. If sort changed since last call: return skeleton data (`rowData: [], rowCount`) to show loading state.
4. Otherwise: `getData(visibleTableHandle, requestIndices, { offset, length })`.
5. `columns2rows()` converts columnar `PTableVector[]` to `PlAgDataTableV2Row[]`.
6. `params.success({ rowData, rowCount })`.
7. `autoSizeColumns()` for all displayed columns (except row number).
8. `loading = false`.
9. `dataRenderedTracker.resolve(params.api)`.

---

## Staleness / Cancellation Model

There is no explicit `AbortController`. Instead, a generation counter provides
cooperative cancellation:

| Location                        | Mechanism                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| Watcher top                     | `++generation.value` on every invocation                                                        |
| `calculateGridOptions`          | Captures `stateGeneration`; throws after each `await` if `stateGeneration !== generation.value` |
| `.then` / `.catch` / `.finally` | Guard: `stateGeneration !== generation.value` -- silently returns                               |
| `getRows()` datasource          | Guard: `stateGeneration !== generation.value` -- calls `params.fail()`                          |

This ensures at most one active settings-change pipeline at a time. Older pipelines
self-terminate at the next `await` boundary or guard check.

---

## Edge Cases

| Scenario                                   | Behavior                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `gridApi` not yet initialized              | Watcher returns; will re-trigger when `gridApi` becomes available                                                                    |
| `gridApi` destroyed mid-pipeline           | All async guards check `gridApi.isDestroyed()` and bail                                                                              |
| Settings object unchanged (false trigger)  | `isJsonEqual(settings, oldSettings)` short-circuits at top                                                                           |
| Model belongs to previous sourceId         | Branch 3: `model.sourceId !== settings.sourceId` detected, skeleton rows shown                                                       |
| Rapid sourceId changes                     | Each invocation increments `generation`; previous async chains self-cancel                                                           |
| Zero rows in data source                   | Datasource calls `showNoRowsOverlay()` after hiding loading overlay (ag-grid limitation: only one overlay at a time)                 |
| Sort changes between getRows calls         | Datasource detects `sortModel` change via `lastParams` comparison, returns empty skeleton data for the stale page                    |
| `calculateGridOptions` throws (non-abort)  | `.catch` logs via `console.trace`, `.finally` sets `loading: false`                                                                  |
| `calculateGridOptions` throws `AbortError` | Silently ignored (expected when PFrame driver cancels requests)                                                                      |
| Selection axes count changes               | Selection reset to empty with new `axesSpec`                                                                                         |
| Selection axes reordered (same set)        | Keys remapped by building an index permutation array                                                                                 |
| Selection axes partially incompatible      | Mapping check fails (has -1 or non-bijective), selection reset                                                                       |
| First load (`oldSettings === null`)        | `sourceId !== oldSettings?.sourceId` is true, loading overlay shown; selection NOT cleared (guard: `oldSettings?.sourceId` is falsy) |
| `pending: true` with `sourceId: null`      | Overlay variant = `"running"` instead of `"not-ready"`                                                                               |

---

## Interaction with Other Subsystems

| Subsystem                           | Interaction                                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State persistence (`useTableState`) | Reads `gridState.value.columnVisibility?.hiddenColIds` to pass to `calculateGridOptions`. Does not write state -- state writes happen via `onStateUpdated` ag-grid callback.          |
| Grid state reload watcher           | Independent watcher on `[gridApi, gridState]`. If external state change triggers ag-grid re-mount (via `reloadKey`), the settings watcher will re-fire because `gridApi` ref updates. |
| `dataRenderedTracker`               | Reset at watcher start. Resolved by datasource after first page. Consumed by `newDataRendered` emit and by `focusRow`/`updateSelection` controller methods which await it.            |
| Overlay text watcher                | Separate watcher on `loadingText`/`runningText`/`notReadyText`/`noRowsText` props. Updates overlay params independently of the settings-change flow.                                  |
| Status bar watcher                  | `watchEffect` that shows/hides `PlAgRowCount` status panel based on `gridOptions.value.loading`.                                                                                      |
