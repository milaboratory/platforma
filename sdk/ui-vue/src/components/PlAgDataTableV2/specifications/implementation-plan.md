# PlAgDataTableV2 -- Implementation Plan

---

## Phase 0: Foundation

### 0.1 Spec: project scaffolding

- Define file structure, public exports, shared constants, internal types

### 0.2 Implement: project scaffolding

- Create directory tree, `index.ts`, `constants.ts`, `types.ts`
- Set up empty root component `PlAgDataTableV2.vue` with full public API (props, emits, v-models, slots, expose)
- Verify it compiles and can be imported

---

## Phase 1: Grid options management

### 1.1 Spec: `useGridOptions`

- Document mutation API, event handler registration, lifecycle (onGridReady / onGridPreDestroyed)

### 1.2 Implement: `useGridOptions`

- Composable with `gridApi`, `gridOptions`, `updateOptions`, `setOption`
- Wire `onGridReady` / `onGridPreDestroyed` via options
- Root component renders `AgGridVue` using this composable

---

## Phase 2: State persistence

### 2.1 Spec: `useTableState`

- Document LRU cache, version migration, per-field refs, PTableParams derivation

### 2.2 Implement: `useTableState`

- Layered computed chain (normalized -> cache entry -> per-field refs)
- `pTableParams` computed derivation
- Debounced persistence to v-model

---

## Phase 3: Overlays

### 3.1 Spec: `useOverlays`

- Document overlay states, transitions, ag-grid constraints, status bar lifecycle

### 3.2 Implement: `useOverlays`

- `showLoading(variant)`, `hideLoading()`, `showNoRows()`, `updateTexts()`
- Status bar show/hide logic
- Wire overlay components into grid options

---

## Phase 4: Column pipeline

### 4.1 Spec: `useColumnPipeline` and utility modules

- Document each pipeline step, index mapping, ColDef construction, datasource creation

### 4.2 Implement: utility functions

- `indexMapping.ts`, `columnFiltering.ts`, `columnSorting.ts`
- `colDefBuilder.ts` (makeColDef, makeRowNumberColDef)
- `columnsToRows.ts`
- `datasourceBuilder.ts`
- `filterMerge.ts`

### 4.3 Implement: `useColumnPipeline`

- Composable that runs the pipeline on trigger
- Exposes `columnDefs`, `datasource`, `axesSpec`, filterable column lists

---

## Phase 5: Settings machine

### 5.1 Spec: `useSettingsMachine`

- Document states, transitions, side effect dispatch, cancellation model

### 5.2 Implement: `useSettingsMachine`

- Typed state machine with four states
- AbortController lifecycle
- Triggers column pipeline, overlay changes, selection resets
- Wire into root component

---

## Phase 6: Row number column

### 6.1 Spec: `useRowNumberColumn`

- Document column def, measurement approach, auto-sizing, column ordering

### 6.2 Implement: `useRowNumberColumn`

- Template-based measurement element
- Auto-size logic, event listeners, column order enforcement
- Cleanup tied to Vue lifecycle

---

## Phase 7: Grid state reload

### 7.1 Spec: `useGridStateReload`

- Document external state detection, comparison normalization, re-mount flow

### 7.2 Implement: `useGridStateReload`

- Watcher on gridState vs ag-grid state
- `reloadKey` management
- `isReloading` guard scoped inside composable

---

## Phase 8: Selection

### 8.1 Spec: `useSelectionManager` and `remapAxes`

- Document selection lifecycle, remapping algorithm, programmatic API

### 8.2 Implement: `remapAxes` utility

- Shared axis remapping function

### 8.3 Implement: `useSelectionManager`

- `onSelectionChanged` handler
- `updateSelection` controller method
- Selection remapping on axesSpec change
- Selection clearing on sourceId change

---

## Phase 9: Root component assembly

### 9.1 Spec: root component wiring

- Document how composables connect, template structure, slot forwarding

### 9.2 Implement: root component

- Wire all composables together in `PlAgDataTableV2.vue`
- Template: sheets, search, column manager, filters, export, AgGridVue, measurement element
- Expose controller (focusRow, updateSelection)
- Emit events (rowDoubleClicked, cellButtonClicked, newDataRendered)

---

## Phase 10: Integration and migration

### 10.1 Smoke test

- Render V2 component in place of V1 in a test block
- Verify: data loads, sorting works, filters work, sheets work, selection works, export works

### 10.2 Feature parity verification

- Go through each V1 specification and verify V2 covers it
- Test edge cases: zero rows, rapid sourceId changes, state restore, column visibility defaults

### 10.3 Migration

- Update public exports to point to V2
- Deprecate V1 component
