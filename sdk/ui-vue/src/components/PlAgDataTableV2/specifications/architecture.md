# PlAgDataTableV2 -- Architecture

High-level architecture for a clean reimplementation of the data table component.
Same public API, same feature set, better internal structure.

---

## Public API (preserved exactly)

### Props

| Prop                                | Type                                           | Required |
| ----------------------------------- | ---------------------------------------------- | -------- |
| `settings`                          | `Readonly<PlDataTableSettingsV2>`              | yes      |
| `disableColumnsPanel`               | `boolean`                                      | no       |
| `disableFiltersPanel`               | `boolean`                                      | no       |
| `showExportButton`                  | `boolean`                                      | no       |
| `showCellButtonForAxisId`           | `AxisId`                                       | no       |
| `cellButtonInvokeRowsOnDoubleClick` | `boolean`                                      | no       |
| `loadingText`                       | `string \| { title; subtitle }`                | no       |
| `runningText`                       | `string \| { title; subtitle }`                | no       |
| `notReadyText`                      | `string`                                       | no       |
| `noRowsText`                        | `string`                                       | no       |
| `cellRendererSelector`              | `CellRendererSelectorFunc<PlAgDataTableV2Row>` | no       |

### v-models

| Model        | Type                            |
| ------------ | ------------------------------- |
| `tableState` | `PlDataTableStateV2`            |
| `selection`  | `PlSelectionModel \| undefined` |

### Emits

| Event               | Payload                  |
| ------------------- | ------------------------ |
| `rowDoubleClicked`  | `PTableKey \| undefined` |
| `cellButtonClicked` | `PTableKey \| undefined` |
| `newDataRendered`   | (none)                   |

### Exposed controller

| Method            | Signature                                                                       |
| ----------------- | ------------------------------------------------------------------------------- |
| `focusRow`        | `(rowKey: PTableKey) => Promise<boolean>`                                       |
| `updateSelection` | `(opts: { axesSpec: AxisId[]; selectedKeys: PTableKey[] }) => Promise<boolean>` |

### Slots

| Slot            | Purpose                        |
| --------------- | ------------------------------ |
| `before-sheets` | Content before sheet dropdowns |
| `after-sheets`  | Content after sheet dropdowns  |

---

## Design principles

1. **Explicit state machine** -- the settings-change flow is a typed state machine with named states and transitions, not an implicit if/else tree with mutable closures.
2. **Single responsibility composables** -- each composable owns one concern and exposes a narrow interface; the root component wires them together.
3. **Unidirectional data flow where possible** -- state flows settings -> composables -> ag-grid. The only feedback path is ag-grid -> grid state persistence.
4. **Dependency injection for external services** -- `PFrameDriver` is injected via Vue `provide`/`inject`, not accessed from a global singleton.
5. **Proper cancellation** -- all async operations use `AbortController` for cancellation instead of generation counters.
6. **Lifecycle-safe DOM** -- no manual DOM elements appended to `document.body`; measurement uses refs within the component tree.
7. **No proxy hacks** -- ag-grid option updates go through a single mutation function that synchronizes both the ag-grid API and the reactive ref.

---

## Layer architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PlAgDataTableV2.vue                        │
│             (thin shell: template + composable wiring)          │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │          │
       v          v          v          v          v
  useSettings  useGrid   useTable   useColumns  useSelection
  Machine      Options   State      Pipeline    Manager
       │          │          │          │          │
       │          │          │          │          │
       v          v          v          v          v
┌─────────────────────────────────────────────────────────────────┐
│                     Shared utilities layer                       │
│  (axis-remapping, filter-merging, serialization, constants)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Composable responsibilities

### 1. useSettingsMachine

**Concern:** orchestrates the response to `settings` prop changes.

Replaces the 150-line settings watcher. Exposes a typed state machine with four states:

| State            | Condition                                                | Effect                                           |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `no-source`      | `sourceId === null`                                      | Show not-ready/running overlay, clear datasource |
| `source-changed` | `sourceId` changed from previous                         | Show loading overlay, clear selection            |
| `model-pending`  | `sourceId` set but model not ready or belongs to old run | Install skeleton datasource (preserve row count) |
| `model-ready`    | model available and matches current sourceId             | Trigger column pipeline + datasource creation    |

Internally uses a `shallowRef<SettingsState>` discriminated union. Transitions are pure functions of `(prevState, newSettings) -> nextState + sideEffects[]`. Side effects (overlay updates, selection resets, pipeline triggers) are dispatched after the transition.

**Cancellation:** owns an `AbortController` that is aborted on every transition, propagated to all async operations (spec fetching, data fetching).

### 2. useGridOptions

**Concern:** manages the ag-grid `GridOptions` ref and provides a controlled mutation API.

Replaces the `Proxy`-based `useGrid`. Exposes:

- `gridOptions: ShallowRef<GridOptions>` -- the reactive options object.
- `gridApi: ShallowRef<GridApi | null>` -- set on `onGridReady`, cleared on destroy.
- `updateOptions(partial: Partial<GridOptions>): void` -- merges into `gridOptions`, then calls `gridApi.updateGridOptions(partial)`.
- `setOption(key, value): void` -- single-key variant of `updateOptions`.

No proxy. The mutation functions are the only way to change grid options, ensuring the ref and the ag-grid instance stay in sync. Event handlers (`onGridReady`, `onGridPreDestroyed`, `onStateUpdated`) are configured via options passed to the composable, not reassigned at runtime.

### 3. useTableState

**Concern:** state persistence with LRU cache, version migration, PTableParams derivation.

Same responsibility as the current `useTableState`, but with cleaner boundaries:

- Exposes: `gridState`, `sheetsState`, `filtersState`, `searchString` as `WritableComputedRef`s.
- Exposes: `pTableParams: ComputedRef<PTableParamsV2>` -- derived from the current state.
- Internal: LRU cache (depth 5), debounced persistence (300ms), version migration.
- `filtersState` uses `computed` with explicit setter, no `ref()` + deep watcher workaround. Mutations in the filter tree are handled by the filter UI emitting a new root reference (structural sharing is fine, but the root ref must change).

### 4. useColumnPipeline

**Concern:** transforms `PTableColumnSpec[]` into ag-grid `ColDef[]` and builds the datasource.

Replaces `calculateGridOptions`. Split into pure, testable steps:

| Step                   | Input                                       | Output                       |
| ---------------------- | ------------------------------------------- | ---------------------------- |
| `fetchSpecs`           | model handles, AbortSignal                  | full + visible specs         |
| `buildIndexMapping`    | full specs, visible specs                   | full-to-visible index map    |
| `filterColumns`        | full specs, sheet axes                      | filtered indices + label map |
| `sortColumns`          | filtered indices, specs                     | sorted indices               |
| `resolveLabels`        | sorted indices, label map                   | fields[] + indices[]         |
| `computeDefaultHidden` | fields, indices, specs                      | default hidden col IDs       |
| `buildColDefs`         | fields, indices, specs, hidden, cellButton  | ColDef[]                     |
| `buildDatasource`      | visible handle, index mappings, AbortSignal | IServerSideDatasource        |

Each step is a pure function (except `fetchSpecs` and `buildDatasource` which are async/effectful). Each step is independently testable.

The composable itself runs the pipeline when triggered by `useSettingsMachine` and exposes:

- `columnDefs: Ref<ColDef[] | undefined>`
- `datasource: Ref<IServerSideDatasource | undefined>`
- `axesSpec: Ref<AxisSpec[]>`
- `filterableColumns: Ref<PTableColumnSpec[]>`
- `visibleFilterableColumns: Ref<PTableColumnSpec[]>`

### 5. useSelectionManager

**Concern:** row selection state, axes remapping, programmatic selection.

Replaces the selection-related code scattered across the root component and `useGrid`. Owns:

- Reacting to `onSelectionChanged` from ag-grid and writing `selectedKeys` to the v-model.
- `updateSelection(opts)` controller method with proper axis remapping.
- Selection remapping on `axesSpec` change (shared `remapAxes` utility used in both directions).
- Selection clearing when `sourceId` changes.

Axis remapping logic is extracted to a shared utility `remapKeys(oldAxesSpec, newAxesSpec, keys)` used by both `updateSelection` and the settings-change remapping.

### 6. useOverlays

**Concern:** overlay state management (loading/no-rows/status bar).

Replaces the scattered overlay logic. Exposes:

- `showLoading(variant: "not-ready" | "running" | "loading"): void`
- `hideLoading(): void`
- `showNoRows(): void`
- `updateTexts(texts: OverlayTexts): void`

Internally handles the ag-grid constraint that `hideOverlay()` must be called before switching from no-rows to loading. The `PlAgRowCount` status bar visibility is derived from the loading state.

### 7. useRowNumberColumn

**Concern:** row number column definition, auto-sizing, column ordering.

Replaces `row-number.ts`. Key change: width measurement uses a `ref`-managed element inside the component template (a hidden `<span>`) instead of appending a `<div>` to `document.body`. This eliminates the memory leak risk and ties cleanup to Vue's component lifecycle.

### 8. useGridStateReload

**Concern:** detecting external grid state changes and triggering ag-grid re-mount.

Replaces the reload watcher. Watches `gridState` against the current ag-grid state, increments a `reloadKey` when they diverge. The `isReloading` guard is scoped inside this composable instead of being a bare `let` in the root component.

---

## Component tree

```
PlAgDataTableV2 (root)
  |
  +-- PlAgDataTableSheets (partition dropdowns, v-model: sheetsState)
  |     +-- slot: before-sheets
  |     +-- PlDropdownLine[] (one per sheet)
  |     +-- slot: after-sheets
  |
  +-- PlTableFastSearch (v-model: searchString)
  |
  +-- PlAgGridColumnManager (column visibility panel)
  |
  +-- PlTableFiltersV2 (advanced filter panel)
  |
  +-- PlAgCsvExporter (export button)
  |
  +-- AgGridVue (:key="reloadKey")
  |     +-- PlAgColumnHeader (custom header)
  |     +-- PlAgRowNumHeader (select-all checkbox)
  |     +-- PlAgRowNumCheckbox (row number + checkbox)
  |     +-- PlAgTextAndButtonCell (optional cell button)
  |     +-- PlAgOverlayLoading (loading states)
  |     +-- PlAgOverlayNoRows (empty state)
  |
  +-- <span ref="measureEl" /> (hidden, for row-number width measurement)
```

Sub-components (`PlAgDataTableSheets`, `PlTableFastSearch`, `PlAgGridColumnManager`, `PlTableFiltersV2`, `PlAgCsvExporter`, overlays, cell renderers) are reused from the existing implementation without changes. The reimplementation focuses on the root component and its composables.

---

## Data flow overview

```
settings (prop)
  |
  v
useSettingsMachine
  |  determines current state
  |  triggers column pipeline on model-ready
  |
  +---> useColumnPipeline
  |       fetches specs, builds ColDefs + datasource
  |       |
  |       v
  |     useGridOptions.updateOptions({ columnDefs, serverSideDatasource })
  |       |
  |       v
  |     ag-grid renders data via datasource.getRows()
  |
  +---> useOverlays
  |       manages loading/no-rows/status-bar states
  |
  +---> useSelectionManager
          handles selection state + remapping

tableState (v-model)
  |
  v
useTableState
  |  reads/writes LRU cache per sourceId
  |  derives PTableParamsV2
  |  exposes gridState, sheetsState, filtersState, searchString
  |
  +---> gridState ---> useGridStateReload (watches for external changes, triggers re-mount)
  |
  +---> sheetsState ---> PlAgDataTableSheets (v-model)
  |
  +---> filtersState ---> PlTableFiltersV2 (v-model)
  |
  +---> searchString ---> PlTableFastSearch (v-model)
  |
  +---> pTableParams ---> consumed by parent (createPlDataTableV2/V3)
```

---

## Key differences from current implementation

| Aspect                  | Current (V1)                                     | New (V2)                                             |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Root component          | 530-line god component                           | Thin shell wiring composables                        |
| Settings orchestration  | Implicit 4-branch if/else watcher                | Typed state machine (`useSettingsMachine`)           |
| Grid option mutations   | `Proxy` on `GridApi`                             | Explicit `updateOptions` / `setOption` functions     |
| Column pipeline         | Single 320-line async function                   | Pipeline of pure steps in `useColumnPipeline`        |
| Cancellation            | Generation counter (no actual cancellation)      | `AbortController` propagated to all async operations |
| Global state access     | `getRawPlatformaInstance().pFrameDriver`         | `inject(PFrameDriverKey)`                            |
| Row-number measurement  | Hidden `<div>` appended to `document.body`       | Template `<span ref>` managed by Vue lifecycle       |
| Event handler contracts | Throwing stubs reassigned at runtime             | Options/callbacks passed to composable constructors  |
| Selection remapping     | Duplicated in settings watcher + updateSelection | Shared `remapKeys()` utility                         |
| Filter deep reactivity  | `ref()` + deep `watch()` workaround              | Filter UI emits new root ref, no deep watch          |
| State reload guard      | Bare `let isReloading` in root scope             | Scoped inside `useGridStateReload`                   |
| Magic numbers           | Scattered, undocumented                          | Named constants in `constants.ts`                    |
| Type safety             | `context` is `any`, `as` casts everywhere        | Typed ColDef extensions, narrowing over casting      |

---

## File structure

```
PlAgDataTableV2/
  index.ts                          -- public exports
  PlAgDataTableV2.vue               -- thin root component
  constants.ts                      -- named constants (cache depth, block size, debounce, etc.)
  types.ts                          -- internal types (SettingsState, PipelineResult, etc.)
  specifications/
    architecture.md                 -- this document
    ...                             -- per-part detailed specs (to be created)
  composables/
    useSettingsMachine.ts
    useGridOptions.ts
    useTableState.ts                -- (reuses existing logic, cleaner boundaries)
    useColumnPipeline.ts
    useSelectionManager.ts
    useOverlays.ts
    useRowNumberColumn.ts
    useGridStateReload.ts
  utils/
    remapAxes.ts                    -- shared axis remapping logic
    filterMerge.ts                  -- filter combination + distillation
    indexMapping.ts                 -- full-to-visible spec index mapping
    columnFiltering.ts              -- column filtering (partitioned, label, hidden, linker)
    columnSorting.ts                -- column sorting (axes-first, orderPriority)
    colDefBuilder.ts                -- makeColDef + makeRowNumberColDef
    datasourceBuilder.ts            -- server-side datasource factory
    columnsToRows.ts                -- columnar-to-row conversion
```

---

## Detailed specification documents (to be created)

Each composable and utility module gets its own detailed spec:

| Document               | Covers                                                  |
| ---------------------- | ------------------------------------------------------- |
| `settings-machine.md`  | State machine states, transitions, side effects         |
| `grid-options.md`      | Mutation API, event handler wiring, lifecycle           |
| `table-state.md`       | LRU cache, version migration, PTableParams derivation   |
| `column-pipeline.md`   | Step-by-step column processing, index mapping           |
| `selection-manager.md` | Selection lifecycle, remapping, programmatic API        |
| `overlays.md`          | Overlay state machine, ag-grid constraints              |
| `row-number-column.md` | Column def, measurement, auto-sizing, ordering          |
| `grid-state-reload.md` | External state detection, re-mount flow                 |
| `datasource.md`        | Server-side datasource, lazy loading, sort handling     |
| `filter-merge.md`      | Three-source filter merge, distillation                 |
| `csv-export.md`        | Export paths (client-side, server-side, temporary grid) |
