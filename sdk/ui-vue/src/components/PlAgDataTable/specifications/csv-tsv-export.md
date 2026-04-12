# Data Flow: CSV/TSV Export

Exports visible table data as a tab-separated file. Two code paths depending on row model type.

Source: `PlAgCsvExporter/PlAgCsvExporter.vue`, `PlAgCsvExporter/export-csv.ts`.
Grid setup: `compositions/useGrid.ts` (`defaultCsvExportParams`).

---

## Component: PlAgCsvExporter

Vue component. Receives `GridApi` as a single required prop.

Renders a ghost button with `"export"` icon and `"Export"` label. Button is teleported into the block page title bar via `usePlBlockPageTitleTeleportTarget("PlAgCsvExporter")`. The teleport target must exist in the DOM (provided by `PlAgDataTableToolsPanel` or equivalent); if absent, the button is not rendered (`v-if="teleportTarget"`).

Visibility in `PlAgDataTableV2`: controlled by the `showExportButton` prop. Rendered only when both `gridApi` is defined and `showExportButton` is truthy.

Loading state: a `shallowRef<boolean>` (`exporting`) is set to `true` before export and reset to `false` via the `completed` callback. While `true`, the button displays a loading spinner and blocks re-entry.

---

## Default CSV Export Parameters

Configured in `useGrid.ts` on the ag-grid `GridOptions.defaultCsvExportParams`:

| Parameter         | Value         | Effect                                    |
| ----------------- | ------------- | ----------------------------------------- |
| `allColumns`      | `true`        | Exports all columns, including off-screen |
| `suppressQuotes`  | `true`        | No quoting around cell values             |
| `columnSeparator` | `"\t"`        | Tab character as delimiter (TSV format)   |
| `fileName`        | `"table.tsv"` | Downloaded file name                      |

These params are inherited by the temporary grid in the serverSide path (copied via `gridApi.getGridOption("defaultCsvExportParams")`).

---

## Export Function: `exportCsv`

Signature: `async function exportCsv(gridApi: GridApi, completed: () => void)`.

Reads `rowModelType` from the grid and branches:

### Branch 1: `clientSide`

Synchronous. Calls `gridApi.exportDataAsCsv()` directly. Invokes `completed()` immediately after.

All data is already loaded in the client-side row model, so no additional fetching is needed.

### Branch 2: `serverSide`

Two sub-paths based on cache state.

#### Sub-path A: All data already cached

Condition: `state.length === 0` OR `state[0].rowCount <= state[0].cacheBlockSize`.

Where `state = gridApi.getServerSideGroupLevelState()` returns an array of `{ rowCount, cacheBlockSize }` per group level.

If the total row count fits within a single cache block, all rows are already loaded. Calls `gridApi.exportDataAsCsv()` directly on the existing grid. Invokes `completed()`.

#### Sub-path B: Data exceeds cache (temporary grid)

Condition: `state[0].rowCount > state[0].cacheBlockSize`.

Procedure:

1. Create an off-screen `<div>` (hidden, absolutely positioned) and append it to `document.body`.
2. Build `GridOptions` for the temporary grid:

| Option                   | Value / Source                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rowModelType`           | `"serverSide"`                                                                                                                                          |
| `columnDefs`             | Copied from original grid. Filtered to flat `ColDef` only (no `ColGroupDef`). Each def reduced to `{ headerName, field, valueFormatter, valueGetter }`. |
| `serverSideDatasource`   | Same datasource instance as the original grid (`gridApi.getGridOption("serverSideDatasource")`)                                                         |
| `cacheBlockSize`         | Set to `state[0].rowCount` (total row count), forcing a single-block fetch of all rows                                                                  |
| `defaultCsvExportParams` | Copied from original grid                                                                                                                               |
| `onModelUpdated`         | Export trigger callback (see below)                                                                                                                     |

3. Call `createGrid(gridDiv, gridOptions, { modules: [ServerSideRowModelModule] })` to instantiate the temporary grid.
4. The temporary grid's datasource fetches all rows in one request (since `cacheBlockSize` equals total `rowCount`).
5. `onModelUpdated` fires on each model update. Export is triggered when:
   - `exportStarted` flag is `false` (prevents duplicate exports).
   - `state.length > 0`.
   - `state[0].rowCount === state[0].cacheBlockSize` (all data loaded into the single cache block).
6. On trigger: set `exportStarted = true`, call `event.api.exportDataAsCsv()`, remove the off-screen `<div>` from `document.body`, invoke `completed()`.

### Branch 3: Unsupported row model

Calls `completed()` first, then throws `Error("exportCsv unsupported for rowModelType = ${rowModel}")`.

---

## Temporary Grid Column Definitions

The temporary grid receives a simplified copy of column definitions from the original grid. Transformation pipeline:

1. `gridApi.getColumnDefs()` -- returns `(ColDef | ColGroupDef)[]` or `undefined`.
2. `.filter()` -- removes any `ColGroupDef` entries (detected by presence of `"children"` property). Only flat `ColDef` entries pass.
3. `.map()` -- reduces each `ColDef` to four properties:

| Kept Property    | Purpose                             |
| ---------------- | ----------------------------------- |
| `headerName`     | Column header text in exported file |
| `field`          | Row data key                        |
| `valueFormatter` | Formatting function for cell values |
| `valueGetter`    | Custom value extraction function    |

All other `ColDef` properties (renderers, editors, width, pinning, cell styles) are discarded. The temporary grid exists solely for data export.

4. Falls back to `[]` if `getColumnDefs()` returns `undefined`.

---

## Off-Screen Grid DOM Lifecycle

| Function              | Action                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `createGridDiv()`     | Creates `<div>`, sets `visibility: hidden`, `position: absolute`, appends to `document.body`. Returns the element. |
| `destroyGridDiv(div)` | Removes the `<div>` from `document.body`.                                                                          |

The div is created before `createGrid` and destroyed inside `onModelUpdated` after export completes. The ag-grid instance itself is not explicitly destroyed (no `api.destroy()` call); it becomes unreachable after DOM removal and is garbage-collected.

---

## Sequence Diagram: serverSide Export (data exceeds cache)

```
User click
  -> PlAgCsvExporter.initiateExport()
  -> exporting.value = true
  -> exportCsv(gridApi, completed)
      -> getServerSideGroupLevelState()
      -> rowCount > cacheBlockSize
      -> createGridDiv() -> hidden <div> in document.body
      -> createGrid(div, options, modules)
          -> serverSideDatasource.getRows({ startRow: 0, endRow: rowCount })
          -> data loaded
          -> onModelUpdated fires
              -> state[0].rowCount === state[0].cacheBlockSize
              -> exportStarted = true
              -> api.exportDataAsCsv() -> browser download "table.tsv"
              -> destroyGridDiv(div)
              -> completed() -> exporting.value = false
```

---

## Integration with PlAgDataTableV2

In `PlAgDataTableV2.vue`:

```
<PlAgCsvExporter v-if="gridApi && showExportButton" :api="gridApi" />
```

The `showExportButton` prop is optional, defaults to `undefined` (falsy). When enabled, the export button appears in the block page title bar teleport slot. The `PlAgDataTableToolsPanel` component (or equivalent) must be present in the layout to provide the teleport target.

---

## Output Format

Despite the function name `exportCsv`, the actual output is TSV due to `defaultCsvExportParams`:

| Aspect           | Value                                     |
| ---------------- | ----------------------------------------- |
| Separator        | Tab (`\t`)                                |
| Quoting          | None (suppressed)                         |
| Columns included | All (including off-screen)                |
| File name        | `table.tsv`                               |
| File encoding    | ag-grid default (UTF-8 with BOM)          |
| Row model source | All rows (fetched in full for serverSide) |

---

## Dependencies

| Dependency                          | Source                  |
| ----------------------------------- | ----------------------- |
| `GridApi`                           | `ag-grid-enterprise`    |
| `createGrid`                        | `ag-grid-enterprise`    |
| `ServerSideRowModelModule`          | `ag-grid-enterprise`    |
| `PlBtnGhost`                        | `@milaboratories/uikit` |
| `usePlBlockPageTitleTeleportTarget` | `@milaboratories/uikit` |

---

## Limitations and Edge Cases

1. No progress indicator for large serverSide exports. The button shows a spinner but no percentage or row count.
2. The temporary grid's `onModelUpdated` may fire multiple times before data is ready; the `exportStarted` flag prevents duplicate exports but relies on a mutable boolean closure variable.
3. The temporary grid's ag-grid instance is not explicitly destroyed via `api.destroy()`. Relies on garbage collection after DOM removal.
4. Column groups (`ColGroupDef`) are excluded from the temporary grid. If the original grid uses grouped columns, the export flattens them.
5. No error handling if the serverSide datasource fails during the temporary grid fetch. The `completed` callback would never fire, leaving the button in a permanent loading state.
6. The `completed` callback is called even on unsupported row model types (before throwing), ensuring the button loading state resets.
