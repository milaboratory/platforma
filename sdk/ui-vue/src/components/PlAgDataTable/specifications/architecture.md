# PlAgDataTable - Architecture & Technical Flows

## Component Graph

```
PlAgDataTableV2 (root)
├── PlAgGridColumnManager ─── teleports button to ──┐
├── PlTableFiltersV2 ────── teleports button to ────┤
├── PlAgCsvExporter ──────── teleports button to ────┤
│                                                    ▼
│                                          PlAgDataTableToolsPanel
│                                          (external teleport target,
│                                           placed by consumer in page layout)
│
├── PlAgDataTableSheets (partition dropdowns)
│     └── slots: before-sheets, after-sheets
│
├── PlTableFastSearch (search input)
│
└── AgGridVue (ag-grid-enterprise, serverSide row model)
      ├── PlAgColumnHeader (custom header: type icon, label, tooltip, sort indicator)
      ├── PlAgRowNumHeader (select-all checkbox header)
      ├── PlAgRowNumCheckbox (row number + checkbox cell)
      └── PlAgTextAndButtonCell (text + action button cell, optional)
```

## Data Flow: From Block Model to Rendered Table

```
Block code (createPlDataTableV2 / V3)
  │
  │  produces PlDataTableModel:
  │    ├── fullTableHandle    (all columns including hidden)
  │    ├── visibleTableHandle (columns after applying hide/sort/filter)
  │    └── fullPframeHandle   (for filter metadata queries)
  │
  ▼
usePlDataTableSettingsV2()
  │
  │  combines model + sourceId + sheets + pending/error status
  │  into PlDataTableSettingsV2
  │
  ▼
PlAgDataTableV2 (settings prop)
  │
  ├──► useTableState()
  │      reads/writes PlDataTableStateV2 (v-model)
  │      exposes: gridState, sheetsState, filtersState, searchString
  │      persists per-sourceId with LRU cache (depth 5)
  │      converts UI state → PTableParamsV2 (filters, sorting, hiddenColIds)
  │
  ├──► useGrid()
  │      creates GridApi proxy + GridOptions
  │      configures overlays, selection mode, row model, event handlers
  │
  ├──► useFilterableColumns()
  │      derives list of filterable columns from columnDefs
  │      separates all columns vs visible-only columns
  │
  └──► calculateGridOptions()   (async, on every settings change)
         │
         │  1. fetches specs: getSpec(fullTableHandle), getSpec(visibleTableHandle)
         │  2. builds column definitions (ColDef[])
         │  3. builds server-side datasource
         │
         ▼
       ag-grid renders data
```

## Data Flow: Server-Side Datasource (lazy loading)

```
User scrolls / sorts
  │
  ▼
ag-grid calls serverSideDatasource.getRows({ startRow, endRow, sortModel })
  │
  ├── first call: getShape(visibleTableHandle) → total row count
  │
  ├── getData(visibleTableHandle, requestIndices, { offset, length })
  │     returns columnar PTableVector[]
  │
  ├── columns2rows() transforms columnar data → PlAgDataTableV2Row[]
  │
  └── params.success({ rowData, rowCount })
        ag-grid renders rows, autoSizeColumns
```

## Data Flow: State Persistence

```
User interacts (sort, reorder, hide column, change sheet, change filter, type search)
  │
  ▼
ag-grid fires onStateUpdated / component v-model updates
  │
  ▼
gridState / sheetsState / filtersState / searchString  (writable computed refs)
  │
  ▼
useTableState setter
  │  finds or creates cache entry by sourceId
  │  computes PTableParamsV2 (sorting, filters, hiddenColIds)
  │  trims cache to 5 entries (LRU)
  │  debounces write (300ms)
  │
  ▼
tableState v-model emits to parent
  │
  ▼
parent persists PlDataTableStateV2 (e.g. in block state)
```

## Data Flow: Settings Change

```
settings watcher triggers
  │
  ├── sourceId === null (no data source)
  │     show "not-ready" or "running" overlay
  │     clear selection
  │     return
  │
  ├── sourceId changed (different data source)
  │     show "loading" overlay
  │     clear selection
  │
  ├── model === undefined or model.sourceId !== sourceId (model not ready yet)
  │     show skeleton rows (empty datasource with preserved row count)
  │     return
  │
  └── model ready
        calculateGridOptions() → update columnDefs + datasource
        remap selection if axesSpec changed
        emit newDataRendered when first page loads
```

## Data Flow: Column Definitions

```
calculateGridOptions()
  │
  ├── fetch full + visible table specs
  │
  ├── build mapping: fullSpecs index → visibleSpecs index (hidden → -1)
  │
  ├── filter out:
  │     - partitioned axes (handled by sheets)
  │     - label columns (merged into their axis)
  │     - hidden columns (pl7.app/table/hide annotation)
  │     - linker columns
  │
  ├── sort: axes first, then by OrderPriority annotation (desc)
  │
  ├── replace axis indices with their label column indices (if label exists)
  │
  ├── compute default hidden columns (isColumnOptional annotation, when no saved state)
  │
  └── build ColDef[] via makeColDef():
        - colId: canonicalized { source, labeled }
        - headerName from pl7.app/label annotation
        - lockPosition for axes
        - hide based on hiddenColIds
        - valueFormatter from d3-format annotation
        - cellStyle with fontFamily from annotation
        - headerComponent: PlAgColumnHeader with type + tooltip
        - cellRendererSelector for cell button (if configured)
```

## Data Flow: Row Selection

```
User clicks checkbox (PlAgRowNumCheckbox)
  │
  ▼
ag-grid updates server-side selection state
  │
  ▼
onSelectionChanged handler
  │  reads toggledNodes from selection state
  │  parses row IDs back to PTableKey[]
  │  updates selection v-model
  │
  ▼
parent receives PlSelectionModel { axesSpec, selectedKeys }
```

```
Programmatic: controller.updateSelection({ axesSpec, selectedKeys })
  │
  ├── waits for dataRenderedTracker (ensures grid has data)
  ├── maps caller's axesSpec → internal axes order
  ├── remaps keys to match internal order
  ├── calls setServerSideSelectionState()
  └── waits for selection v-model to update (with 500ms timeout)
```

## Data Flow: Sheet / Partition Filtering

```
PlAgDataTableSheets receives sheets config from settings
  │
  ├── normalizes: filters empty-options sheets, resolves defaults
  │     (cached value → metadata default → first option)
  │
  ├── renders PlDropdownLine per sheet
  │
  └── on change: updates sheetsState
        │
        ▼
      useTableState converts sheetsState → partition filter specs
        (patternEquals for strings, equal for numbers)
        │
        ▼
      merged into PTableParamsV2.filters alongside column filters and search
```

## Data Flow: Column Filters

```
PlTableFiltersV2 manages PlDataTableFiltersWithMeta (tree: AND/OR groups of leaf filters)
  │
  ├── uses fullPframeHandle to fetch column metadata and unique values for suggestions
  │
  └── on change: updates filtersState
        │
        ▼
      useTableState.createPTableParams() combines:
        - partition filters (from sheets)
        - column filters (from filter panel)
        - search filter (from fast search)
        into single FilterSpec, then distillFilterSpec() → PTableParamsV2.filters
```

## Data Flow: Fast Search

```
PlTableFastSearch manages search string
  │
  └── on change: updates searchString
        │
        ▼
      createSearchFilterNode() builds OR-filter across all visible filterable columns:
        - text columns → patternEquals
        - numeric columns → equal (if search string is a valid number)
        │
        ▼
      merged into combined filter spec
```

## Data Flow: Grid State Reload

```
gridState changes from external source (e.g. state restored from cache)
  │
  ▼
watcher compares gridState with current ag-grid state (via getState())
  │
  ├── if different: increment reloadKey → AgGridVue re-mounts with new initialState
  │     (isReloading flag prevents onGridPreDestroyed from overwriting state)
  │
  └── if same: no-op
```

## Data Flow: Column Visibility Normalization

```
ag-grid fires onStateUpdated
  │
  ▼
normalizeColumnVisibility()
  │
  ├── ag-grid returns columnVisibility: undefined when all visible
  │
  ├── if previous state had explicit visibility → user made all visible → store { hiddenColIds: [] }
  │
  └── if no previous state → compute defaults from isColumnOptional annotations
```

## Data Flow: Row Number Column

```
onGridReady → autoSizeRowNumberColumn(api)
  │
  ├── creates hidden DOM element (cellFake) to measure digit widths
  │
  ├── listens: firstDataRendered, viewportChanged, columnVisible, columnResized
  │     adjusts width based on last displayed row number's digit count
  │
  ├── listens: sortChanged, filterChanged, modelUpdated
  │     refreshes all cells (to update row numbers after reorder)
  │
  └── listens: displayedColumnsChanged
        ensures row number column stays at position 0 (after selection column if present)
```

## Data Flow: CSV/TSV Export

```
User clicks export button (PlAgCsvExporter)
  │
  ├── serverSide row model:
  │     creates temporary off-screen ag-grid (clientSide)
  │     fetches all data in pages
  │     exports from temporary grid
  │
  └── clientSide row model:
        exports directly via api.exportDataAsCsv()
        (tab-separated, no quotes, all columns, "table.tsv")
```

## GridApi Proxy

```
onGridReady creates a Proxy around GridApi
  │
  ├── intercepts setGridOption → also updates gridOptions ref
  ├── intercepts updateGridOptions → also updates gridOptions ref
  └── all other methods → pass through to original api

Purpose: keeps gridOptions shallowRef in sync with actual grid state,
         so Vue reactivity works on gridOptions reads.
```

## Data Flow: Overlay Management

```
                    ┌─────────────────────────────────────┐
                    │          Overlay Priority            │
                    │  (ag-grid shows only one at a time)  │
                    └─────────────────────────────────────┘

loading=true  ──► PlAgOverlayLoading
                    variant="not-ready" → cat-in-bag icon + "Data is not computed"
                    variant="running"   → PlPlaceholder "Running analysis..."
                    variant="loading"   → PlPlaceholder "Loading data..."

loading=false + 0 rows ──► PlAgOverlayNoRows
                             sad-cat icon + "Empty"

loading=false + rows > 0 ──► no overlay, data visible

Status bar (PlAgRowCount) shown only when loading=false.
```
