# Server-Side Datasource

ag-grid `serverSide` row model. Data fetched from `PFrameDriver` in columnar form, converted to rows per page.

Source: `sources/table-source-v2.ts` (`calculateGridOptions`, `columns2rows`, `makeColDef`).
Grid setup: `compositions/useGrid.ts`.

---

## Types

`PFrameDriver.getShape(handle)` — returns `{ columns, rows }`.
`PFrameDriver.getSpec(handle)` — returns `PTableColumnSpec[]` (axes first, then columns).
`PFrameDriver.getData(handle, columnIndices, { offset, length })` — returns `PTableVector[]`.

`PTableVector` — `{ type: ValueType, data: TypedArray | Array, isNA?: Uint8Array }`.
Data field: `Int`→`Int32Array`, `Long`→`BigInt64Array`, `Float`→`Float32Array`, `Double`→`Float64Array`, `String`→`(null|string)[]`.

`PTableHandle` — branded string, produced by `createPTableV2(def, params)` in block code.

`PlDataTableModel` provides two handles:

- `fullTableHandle` — all columns including hidden. Used for column definitions.
- `visibleTableHandle` — columns after sorting/filter/hide. Used for data fetching.

`PTableColumnSpec` — discriminated union: `{ type: "axis", id: AxisId, spec: AxisSpec }` or `{ type: "column", id: PObjectId, spec: PColumnSpec }`.

`PTableValue` — `null | number | string`. `null` = NA.

`PTableHidden = { type: "hidden" }` — sentinel for columns present in full specs but absent in visible specs. Rendered as `"loading..."`.

`PlAgDataTableV2Row` — `{ id: PlTableRowIdJson, axesKey: PTableKey, [field: \`${number}\`]: PTableValue | PTableHidden }`.

---

## calculateGridOptions

Async. Called from settings watcher on every model/sheets/params change. Returns `{ columnDefs, serverSideDatasource, axesSpec }`.

1. Capture `stateGeneration = generation.value`.
2. `Promise.all([getSpec(fullHandle), getSpec(visibleHandle)])`.
3. Build `specsToVisibleSpecsMapping: Map<fullIndex, visibleIndex | -1>` — maps each full spec column to its visible spec position; -1 if absent.
4. Filter full spec indices: remove partitioned axes, label columns (registered for later axis replacement), `isColumnHidden` columns, linker columns.
5. Sort: axes first, then by `Annotation.Table.OrderPriority` descending.
6. `fields = [...sortedIndices]` — field numbers used as row object keys and `ColDef.field`.
7. In a separate `indices` array, replace axis indices with their label column indices (if label exists). `fields` array unchanged.
8. If `hiddenColIds` is undefined, compute defaults from `isColumnOptional` annotations.
9. Build `columnDefs`: row number column + `makeColDef()` per field.
10. Build request mapping (see next section).
11. Create `serverSideDatasource` closure.

---

## Index mapping

Three coordinate spaces: full spec index, visible spec index, result index (position in `getData()` response).

`requestIndices: number[]` — visible spec indices passed to `getData()`. Built by iterating `fields`, looking up each in `specsToVisibleSpecsMapping`. If mapped to -1, skip. Then `uniq([...requestIndices, ...visibleAxesIndices])` to ensure axes always present.

`fieldResultMapping: number[]` — parallel to `fields`. `fieldResultMapping[i]` = index in `requestIndices` where data for `fields[i]` lives, or -1 if hidden.

`axesResultIndices: number[]` — positions of axis columns within `requestIndices`. Used in `columns2rows` to extract `axesKey`.

---

## getRows

`IServerSideDatasource.getRows(params)`. `params.request` has `startRow`, `endRow`, `sortModel`. `params.success/fail` callbacks.

1. Generation guard: `stateGeneration !== generation.value` → `fail()`.
2. Lazy row count: if `rowCount === -1`, call `getShape(visibleHandle)`, cache result in closure. Generation + `isDestroyed` check after await.
3. If `rowCount === 0` → `success({ rowData: [], rowCount })`, `setGridOption("loading", false)`, `showNoRowsOverlay()`. Return.
4. Sort change detection: if `sortModel` differs from `lastParams` → `success({ rowData: [], rowCount })`. Return. Causes skeleton rows until new datasource arrives.
5. `length = min(rowCount, endRow) - startRow`.
6. If `length > 0`: `getData(visibleHandle, requestIndices, { offset: startRow, length })`. Generation + `isDestroyed` check after await. `rowData = columns2rows(fields, data, fieldResultMapping, axesResultIndices)`.
7. `success({ rowData, rowCount })`.
8. `autoSizeColumns(allDisplayedColumns except rowNumber)`. `setGridOption("loading", false)`. `dataRenderedTracker.resolve(api)`.
9. Catch: if stale/destroyed → `fail()`. Otherwise `setGridOption("loading", true)`, `fail()`, `console.trace(error)`.

---

## columns2rows

Converts `PTableVector[]` (columnar) to `PlAgDataTableV2Row[]` (row-per-object).

Per row `iRow`:

- `axesKey = axesResultIndices.map(ri => pTableValue(columns[ri], iRow))`.
- `id = canonicalizeJson(axesKey)`.
- For each `(field, iCol)` in `fields`: `row[field.toString()] = fieldResultMapping[iCol] === -1 ? PTableHidden : pTableValue(columns[fieldResultMapping[iCol]], iRow)`.

---

## pTableValue

`data_types.ts`. Reads single cell from `PTableVector`.

NA detection: if `isNA` bit array present, check bit at row. Otherwise legacy magic values: `Int` → `-2147483648`, `Long` → `-9007199254740991n`, `Float/Double` → `NaN`, `String` → `null`.

`Long` converted to `number` via `Number(bigint)`. `Bytes` not supported (throws).

---

## Value rendering

`value-rendering.ts → getColumnRenderingSpec()`. Returns `valueFormatter` for `ColDef`.

Formatter priority: `undefined` → `"undefined"`, `PTableHidden` → `"loading..."`, `null` (NA) → `""`, numeric with `pl7.app/format` annotation → `d3.format(annotation)(value)`, fallback → `value.toString()`.

Font: `pl7.app/table/fontFamily` annotation. `"monospace"` → `Spline Sans Mono` weight 300.

---

## Row identity

`getRowId: (params) => params.data.id`. `id = canonicalizeJson(axesKey)` — deterministic JSON of composite primary key.

---

## Sort handling

Server-side only. `useTableState` converts ag-grid `sortModel` to `PTableSorting[]` (`{ column, ascending, naAndAbsentAreLeastValues }`). Emitted via `PTableParamsV2` → block creates new `visibleTableHandle` → new datasource.

Default sort order per column: `["desc", "asc", null]`.

In-flight sort change in old datasource: returns empty rows (skeleton state) until replacement.

---

## ag-grid configuration

`useGrid()`: `rowModelType: "serverSide"`, `cacheBlockSize: 1000`, `maxBlocksInCache: 100`, `blockLoadDebounceMillis: 500`, `serverSideSortAllLevels: true`, `suppressServerSideFullWidthLoadingRow: true`.

GridApi wrapped in Proxy: intercepts `setGridOption`/`updateGridOptions` to keep `gridOptions` shallowRef in sync for Vue reactivity.

---

## Generation guard

`generation: Ref<number>` incremented before each `calculateGridOptions` call. Captured as `stateGeneration` in closure. Every async checkpoint in `getRows` and `calculateGridOptions` compares `stateGeneration !== generation.value` — mismatch means superseded, abort.

---

## Row number column

`row-number.ts`. Pinned left, `valueGetter: rowIndex + 1`. Width measured via off-screen DOM element (`cellFake`) filled with widest digit ("5") repeated to match digit count. Re-measured on `firstDataRendered`, `viewportChanged`, `columnVisible`, `columnResized`. Cells refreshed on `sortChanged`, `filterChanged`, `modelUpdated`. Column order enforced on `displayedColumnsChanged`: `[selectionCol?, rowNumberCol, ...rest]`.

---

## dataRenderedTracker

`DeferredCircular<GridApi>`. Resettable deferred promise. Resolved by `getRows` after `success()`. Awaited by `controller.updateSelection()` and `controller.focusRow()` to ensure grid has data before acting. Reset by settings watcher on new data source.

---

## Overlay coordination

ag-grid shows one overlay at a time. Loading overlay takes priority over noRows.

- `sourceId === null` → `loading=true`, variant `"not-ready"` or `"running"`.
- `sourceId` changed → `loading=true`, variant `"loading"`.
- Model not ready → skeleton rows (empty datasource, preserved row count).
- `getRows` success, `rowCount > 0` → `loading=false`, data visible.
- `getRows` success, `rowCount === 0` → `loading=false` first, then `showNoRowsOverlay()`.
- `getRows` error → `loading=true`.
