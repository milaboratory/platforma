# Problems of the current PlAgDataTableV2 implementation

## 1. System-level

### 1.1. Direct global state access

`PlAgDataTableV2.vue:412` calls `getRawPlatformaInstance().pFrameDriver` inside the settings watcher. The component reaches into a global singleton instead of receiving the driver through props or dependency injection. The component cannot be tested outside a running platform instance.

### 1.2. No cancellation of in-flight requests

`calculateGridOptions` performs multiple `await pfDriver.getSpec()` and `pfDriver.getData()` calls. When the generation counter changes, in-flight network requests continue to completion, their results are discarded. There is no `AbortController` or equivalent mechanism. On rapid settings changes this produces wasted network traffic and delayed response times.

### 1.3. Memory leak in row-number column

`autoSizeRowNumberColumn` (`row-number.ts:118-161`) creates a hidden DOM element via `createCellFake()` and appends it to `document.body`. Cleanup depends on the `gridPreDestroyed` event. If the grid is removed from the DOM without firing this event (e.g. parent component unmount race), the DOM element and all registered event listeners leak.

### 1.4. Overlay management relies on undocumented ag-grid behavior

The comment at `table-source-v2.ts:268-269` ("AgGrid cannot show two overlays at once, so first hide loading overlay, then show no rows overlay") documents a workaround that depends on ag-grid internal ordering guarantees, not its public API contract. Any ag-grid version update may break this sequence.

### 1.5. Race window between staleness check and result application

In the settings watcher (`PlAgDataTableV2.vue:424-428`) there is a gap between checking `stateGeneration !== generation.value` and calling `gridApi.updateGridOptions(options)`. Multiple concurrent `calculateGridOptions` calls can interleave in this window.

---

## 2. Architecture-level

### 2.1. God component

`PlAgDataTableV2.vue` is a ~530-line SFC that orchestrates: column definitions, state persistence, grid reload, selection management, overlay control, focus/scroll, column visibility normalization, and settings change handling. Most of the logic is imperative (watchers mutating mutable state). The component has no clear separation of concerns.

### 2.2. calculateGridOptions does too much

`table-source-v2.ts:85-321` is a single async function responsible for: spec fetching, index mapping, column filtering, column ordering, label column replacement, default hidden columns computation, column def creation, and datasource construction. It returns a mixed result of ag-grid options and domain data (`axesSpec`). Changes to column rendering require touching the same function that handles data fetching.

### 2.3. Implicit state machine via mutable closures

The settings watcher captures `oldSettings` as a mutable `let` (`PlAgDataTableV2.vue:336`). `isReloading` (`line 129`) is another mutable flag. `generation` is a ref used as a manual cancellation token. Together they form a state machine with four branches (no source, source changed, model not ready, model ready) and no explicit state type. The transitions are encoded in control flow, not in data.

### 2.4. Fragile GridApi proxy

`useGrid.ts:108-119` creates a `Proxy` around `GridApi` that intercepts `setGridOption` and `updateGridOptions` to keep `gridOptions` shallowRef in sync. Any ag-grid version that adds new methods for modifying options (or renames existing ones) will bypass the proxy silently, leaving `gridOptions` stale.

### 2.5. Throwing stubs as event handler contracts

`useGrid.ts:131-139` defines `onRowDoubleClicked`, `onStateUpdated`, `onGridPreDestroyed` as functions that `throw new Error("not overrided ...")`. These are expected to be reassigned in `PlAgDataTableV2.vue`. If initialization order changes or a new consumer uses `useGrid` without overriding all three, the error surfaces only at runtime.

### 2.6. Bidirectional state sync with visibility normalization

`gridState` flows in two directions: from cache to ag-grid (via `initialState`/`reloadKey`) and from ag-grid to cache (via `onStateUpdated`/`onGridPreDestroyed`). On top of this, `normalizeColumnVisibility` injects a third interpretation layer that distinguishes `undefined` from `{ hiddenColIds: [] }`. `stateForReloadCompare` introduces a fourth (both treated as equivalent). The resulting feedback loop is difficult to reason about.

### 2.7. Duplicated selection remapping logic

Axis remapping exists in two places: the settings watcher (`PlAgDataTableV2.vue:431-471`) and `updateSelection` (`PlAgDataTableV2.vue:296-331`). Both construct an index mapping from one axes spec to another, check for `-1` sentinels, and remap keys. The algorithm is similar but not extracted.

### 2.8. Deep coupling between filter persistence and UI mutation patterns

`table-state-v2.ts:138-143` wraps a computed in `ref()` and adds a deep watcher to propagate mutations back. This is a workaround for Vue's limitation with `computed` + deep object mutations. It creates an extra reactive indirection: mutations inside the filter tree propagate via deep watcher instead of explicit setter calls.

### 2.9. Mixed abstraction levels in settings watcher

The watcher at `PlAgDataTableV2.vue:338-492` mixes high-level state transitions (no source / source changed / model not ready / model ready) with low-level ag-grid API calls (`gridApi.updateGridOptions`, `gridApi.setServerSideSelectionState`, `gridApi.getServerSideGroupLevelState`). Domain logic and framework API calls are interleaved on every branch.

---

## 3. Readability and maintainability

### 3.1. Magic numbers

- `CacheDepth = 5` (`table-state-v2.ts:78`)
- `cacheBlockSize: 1000` (`useGrid.ts:65`)
- `maxBlocksInCache: 100` (`useGrid.ts:66`)
- `blockLoadDebounceMillis: 500` (`useGrid.ts:67`)
- Debounce `300` ms (`table-state-v2.ts:42`)
- `promiseTimeout(promise, 500)` (`PlAgDataTableV2.vue:324`)
- `HeaderSize = 45` (`row-number.ts:14`)

None are documented or centralized.

### 3.2. Type-unsafe context convention

Column specs are stored in the `context` field of `ColDef` (`table-source-v2.ts:361`). Consumers retrieve them via `col.getColDef().context as PTableColumnSpec` (`PlAgDataTableV2.vue:241`). This is an untyped convention — `context` is `any` in ag-grid. There is no compile-time guarantee that the correct type is stored or retrieved.

### 3.3. Type casts instead of type narrowing

`makePartialState` (`PlAgDataTableV2.vue:185-206`) applies `as` casts on every field of `GridState` to produce `PlDataTableGridStateCore`. `PlTableColumnIdJson` is used throughout as a branded string requiring `as` casts at conversion boundaries.

### 3.4. Inconsistent null representations

- `sourceId` is `null` (PlDataTableSettingsV2Base) vs `undefined` (missing from object) in different contexts.
- `filtersState` is `null` in default state (`table-state-v2.ts:177`) but `PlDataTableFiltersWithMeta` elsewhere.
- Index mappings use `-1` as a sentinel for hidden columns (`table-source-v2.ts:125`).
- `hiddenColIds` parameter is `undefined` (no saved state) vs `PlTableColumnIdJson[]` (saved state, possibly empty).

### 3.5. Comments documenting workarounds instead of intent

- "For some reason state[i] is undefined when the sheet initially loads" (`PlAgDataTableSheets.vue:85`)
- "sometimes pinning is strangely not applied" (`row-number.ts:91`)
- "Warning: AgGrid cannot show two overlays at once" (`table-source-v2.ts:268`)
- "Hide no rows overlay if it is shown, or else loading overlay will not be shown" (`PlAgDataTableV2.vue:347`)

These indicate known issues that are patched over rather than root-caused.

### 3.6. Duplicated auto-size logic

`autoSizeColumns` (with row number column filter) is called in `onStateUpdated` (`PlAgDataTableV2.vue:153-158`) and in the datasource's `getRows` success handler (`table-source-v2.ts:300-304`). The filter predicate is identical but not shared.

### 3.7. Non-obvious naming in calculateGridOptions

`fields` and `indices` in `calculateGridOptions` (`table-source-v2.ts:182-193`) have a critical distinction: `fields` are original spec indices used for column defs, `indices` are the same but with axes replaced by their label columns. The names convey nothing about this difference.

### 3.8. Implicit watcher dependencies

The settings watcher (`PlAgDataTableV2.vue:338`) watches `[gridApi.value, settings.value]` but also reads `gridState.value` (`line 418`), `props.showCellButtonForAxisId` (`line 419`), `props.cellButtonInvokeRowsOnDoubleClick` (`line 420`). These reads inside the watcher callback are not tracked as dependencies and will not trigger re-execution, creating potential stale closure bugs.

### 3.9. Inconsistent error handling

- `calculateGridOptions` throws a plain `Error` on generation change (`table-source-v2.ts:114`).
- The datasource's `getRows` calls `params.fail()` instead of throwing.
- The settings watcher has both `.catch()` on the promise chain and a `try/catch` wrapping it (`PlAgDataTableV2.vue:474, 486`).
- `console.trace(error)` is used in some places; others silently discard errors via generation checks.

### 3.10. Complex branching in usePlDataTableSettingsV2

`types.ts:61-113` has a deeply nested if/else tree covering sourceId x sheets x model combinations. Three function overloads funnel into one implementation that uses runtime checks (`"sourceId" in options`). The control flow through six branches is difficult to follow.

### 3.11. Global (non-scoped) CSS in PlAgOverlayNoRows

`PlAgOverlayNoRows.vue:25-49` defines `.grid-overlay-container`, `.grid-icon-sad-cat` as global styles (no `module` or `scoped` attribute). These class names can collide with styles in other components.
