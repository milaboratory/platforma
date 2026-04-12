# Data Flow: Column Definitions

Technical specification for the column definition pipeline in PlAgDataTable.
Covers the full path from raw `PTableColumnSpec[]` to ag-grid `ColDef[]`.

---

## Entry Point

`calculateGridOptions()` in `sources/table-source-v2.ts`.

**Inputs:**

| Parameter              | Type                                    | Description                                                     |
| ---------------------- | --------------------------------------- | --------------------------------------------------------------- |
| `generation`           | `Ref<number>`                           | Monotonic counter; guards against stale async results           |
| `pfDriver`             | `PFrameDriver`                          | Driver for fetching table specs and data                        |
| `model`                | `PlDataTableModel`                      | Contains `fullTableHandle` and `visibleTableHandle`             |
| `sheets`               | `PlDataTableSheet[]`                    | Currently active sheet partitions                               |
| `dataRenderedTracker`  | `DeferredCircular<GridApi>`             | Resolved when data renders                                      |
| `hiddenColIds`         | `PlTableColumnIdJson[] \| undefined`    | Persisted hidden column state; `undefined` means "use defaults" |
| `cellButtonAxisParams` | `PlAgCellButtonAxisParams \| undefined` | Optional cell button configuration for a specific axis          |

**Outputs (relevant to column definitions):**

| Field        | Type                                                        |
| ------------ | ----------------------------------------------------------- |
| `columnDefs` | `ColDef<PlAgDataTableV2Row, PTableValue \| PTableHidden>[]` |
| `axesSpec`   | `AxesSpec`                                                  |

---

## Pipeline Steps

### 1. Fetch Table Specs

Two spec arrays are fetched concurrently via `Promise.all`:

| Handle                     | Variable            | Content                                                       |
| -------------------------- | ------------------- | ------------------------------------------------------------- |
| `model.fullTableHandle`    | `tableSpecs`        | All columns including hidden, label, and linker columns       |
| `model.visibleTableHandle` | `visibleTableSpecs` | Only columns with actual data (server-side filtering applied) |

Both are `PTableColumnSpec[]`, a discriminated union:

| `spec.type` | TypeScript type          | Contains                             |
| ----------- | ------------------------ | ------------------------------------ |
| `"axis"`    | `PTableColumnSpecAxis`   | `id: AxisId`, `spec: AxisSpec`       |
| `"column"`  | `PTableColumnSpecColumn` | `id: PObjectId`, `spec: PColumnSpec` |

Generation check: if `generation.value` changed between the await and continuation, the function throws to abort the stale computation.

### 2. Build Full-to-Visible Index Mapping

Creates `specsToVisibleSpecsMapping: Map<number, number>` where:

- Key: index in `tableSpecs` (full)
- Value: index in `visibleTableSpecs`, or `-1` if the column has no visible counterpart

Matching is done by canonicalizing `PTableColumnId` (via `getPTableColumnId`) and looking it up in a pre-built `visibleSpecsMap`.

This mapping is used later during data fetching to know which request index corresponds to which field, and to mark non-visible fields as `PTableHidden` in row data.

### 3. Identify Partitioned Axes

```
sheetAxesIds = sheets.map(sheet => getAxisId(sheet.axis))
```

A predicate `isPartitionedAxis(axisId)` checks whether any sheet axis matches (via `matchAxisId`). Partitioned axes are excluded from column definitions because they are rendered as sheet selectors outside the grid.

### 4. Collect Label Column Indices

During the filtering pass, each label column encountered is registered:

```
setLabelColumnIndex(labeledAxisId, fullSpecIndex)
```

A label column is identified by: `spec.type === "column" && spec.spec.name === "pl7.app/label" && spec.spec.axesSpec.length === 1`.

Storage: `labelColumns: { axisId: AxisId; labelColumnIdx: number }[]`. Only the first label column per axis is kept; duplicates produce a console warning.

Retrieval via `getLabelColumnIndex(axisId)` returns the full-spec index of the label column for that axis, or `-1` if none exists.

### 5. Filter Columns

The filtering pass iterates `tableSpecs.entries()` and excludes:

| Condition        | Spec type  | Check                                                                                                |
| ---------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| Partitioned axis | `"axis"`   | `isPartitionedAxis(spec.id)` returns `true`                                                          |
| Label column     | `"column"` | `isLabelColumnSpec(spec.spec)` returns `true` (name is `"pl7.app/label"`, single-axis)               |
| Hidden column    | `"column"` | `isColumnHidden(spec.spec)` returns `true` (annotation `pl7.app/table/visibility` equals `"hidden"`) |
| Linker column    | `"column"` | `isLinkerColumnSpec(spec.spec)` returns `true` (annotation `pl7.app/isLinkerColumn` is JSON `true`)  |

Label columns for non-partitioned axes are registered via `setLabelColumnIndex` before being excluded.

Result: `indices: number[]` -- indices into `tableSpecs` of columns that survive filtering.

### 6. Sort Columns

Sorting is applied in-place on `indices` with two-level ordering:

| Priority | Rule                                     | Direction                                            |
| -------- | ---------------------------------------- | ---------------------------------------------------- |
| 1        | Axes before columns                      | Axes always sort first (`spec.type === "axis"` wins) |
| 2        | `pl7.app/table/orderPriority` annotation | Descending (higher numeric value = further left)     |

For axis-type specs, order priority is treated as `0`. For column-type specs, the value is read via `readAnnotationJson(spec.spec, Annotation.Table.OrderPriority)`, defaulting to `0` when absent.

### 7. Derive `fields` and Replace Axis Indices with Label Column Indices

After sorting:

```
fields = [...indices]    // snapshot: these are the "source" column indices used for colId and data keying
```

Then `indices` is transformed: for each axis, if a label column exists for that axis, the index is replaced with the label column's index. This means the grid will display label-column data in the axis's visual slot, while `fields` retains the original axis index for identification.

| Array     | Purpose                                      | After axis replacement                                        |
| --------- | -------------------------------------------- | ------------------------------------------------------------- |
| `fields`  | ColDef identity (`colId`), data field key    | Original axis indices preserved                               |
| `indices` | Data source for the column's rendered values | Axis indices replaced by label column indices where available |

### 8. Compute Default Hidden Columns

Triggered when `hiddenColIds` is `undefined` (no persisted column visibility state).

Iterates `fields` and collects the `PlTableColumnIdJson` for every column where `isColumnOptional(spec.spec)` is `true` (annotation `pl7.app/table/visibility` equals `"optional"`).

The column ID is constructed as:

```
canonicalizeJson<PlTableColumnId>({ source: tableSpecs[field], labeled: tableSpecs[indices[i]] })
```

This means the "labeled" part uses the post-replacement index (the label column spec if one exists).

When `hiddenColIds` is already provided (from persisted state), this step is skipped entirely.

### 9. Build `ColDef[]`

The final array is:

```
[makeRowNumberColDef(), ...fields.map((field, index) => makeColDef(...))]
```

The row-number column is always first (pinned left, non-movable, uses `PlAgRowNumCheckbox` cell renderer).

Each data column is built by `makeColDef(field, tableSpecs[field], tableSpecs[indices[index]], hiddenColIds, cellButtonAxisParams)`.

---

## `makeColDef()` -- Column Definition Builder

**Signature:**

```ts
function makeColDef(
  iCol: number,
  spec: PTableColumnSpec, // the "source" spec (from fields[])
  labeledSpec: PTableColumnSpec, // the "labeled" spec (from indices[], may be a label column)
  hiddenColIds: PlTableColumnIdJson[] | undefined,
  cellButtonAxisParams?: PlAgCellButtonAxisParams,
): ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>;
```

### ColDef Property Map

| ag-grid property        | Source                                                       | Details                                                                                           |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `colId`                 | `canonicalizeJson({ source: spec, labeled: labeledSpec })`   | Deterministic JSON string; type is `PlTableColumnIdJson`                                          |
| `field`                 | `` `${iCol}` ``                                              | Numeric string matching the key in `PlAgDataTableV2Row`                                           |
| `headerName`            | `readAnnotation(spec.spec, Annotation.Label)?.trim()`        | Falls back to `"Unlabeled {spec.type} {iCol}"`                                                    |
| `lockPosition`          | `spec.type === "axis"`                                       | `true` for axes, `false` for columns; prevents user drag-reorder of axis columns                  |
| `hide`                  | `hiddenColIds !== undefined && hiddenColIds.includes(colId)` | `true` when `colId` is in the hidden list                                                         |
| `valueFormatter`        | `getColumnRenderingSpec(spec).valueFormatter`                | See value formatting section below                                                                |
| `cellStyle`             | Object with optional `fontFamily` and `fontWeight`           | See font family section below                                                                     |
| `headerComponent`       | `PlAgColumnHeader`                                           | Vue component for custom header rendering                                                         |
| `headerComponentParams` | `{ type, tooltip }`                                          | See header component params section below                                                         |
| `cellDataType`          | Derived from `valueType`                                     | `"number"` for Int/Long/Float/Double; `"text"` for String/Bytes                                   |
| `mainMenuItems`         | `defaultMainMenuItems`                                       | Returns `["sortDescending", "sortAscending", "separator", "pinSubMenu"]`                          |
| `context`               | `spec`                                                       | The full `PTableColumnSpec`, used by cell renderers to access axis id                             |
| `cellRendererSelector`  | Conditional                                                  | Present only when `cellButtonAxisParams?.showCellButtonForAxisId` is set; see cell button section |

### Header Component Params

Type: `PlAgHeaderComponentParams`.

| Param     | Source                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `type`    | Mapped from `valueType`: Int/Long/Float/Double to `"Number"`, String/Bytes to `"Text"`                 |
| `tooltip` | `readAnnotation(labeledSpec.spec, Annotation.Description)?.trim()` (from the labeled spec, not source) |

Unsupported `valueType` values throw an error.

### Value Formatting

Handled by `getColumnRenderingSpec(spec)` in `sources/value-rendering.ts`.

| Value type                    | Formatter behavior                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Int, Long, Float, Double      | Reads `pl7.app/format` annotation. If present, applies `d3.format(formatString)` to numeric value. If absent, calls `.toString()`. |
| String, Bytes, and all others | Calls `.toString()` on the value directly.                                                                                         |

All formatters first check for special values via `formatSpecialValues()`:

| Value                                         | Rendered as         |
| --------------------------------------------- | ------------------- |
| `undefined`                                   | `"undefined"`       |
| `PTableHidden` (object with `type: "hidden"`) | `"loading..."`      |
| `PTableNA`                                    | `""` (empty string) |

### Font Family

Read from `pl7.app/table/fontFamily` annotation on the source spec.

| Annotation value | Applied `cellStyle`                                   |
| ---------------- | ----------------------------------------------------- |
| `"monospace"`    | `{ fontFamily: "Spline Sans Mono", fontWeight: 300 }` |
| Any other string | `{ fontFamily: <value> }`                             |
| Absent           | No `fontFamily` in `cellStyle`                        |

### Cell Button Renderer

Activated only when `cellButtonAxisParams.showCellButtonForAxisId` is defined.

The `cellRendererSelector` callback:

1. Returns `undefined` (no custom renderer) for non-axis columns.
2. Extracts the `AxisId` from `params.colDef.context.id`.
3. Compares it to `showCellButtonForAxisId` via `isJsonEqual`.
4. If matching, returns `{ component: PlAgTextAndButtonCell, params: { invokeRowsOnDoubleClick, onClick } }`.
5. The `onClick` handler calls `cellButtonAxisParams.trigger(params.data?.axesKey)`.

---

## `PlTableColumnId` -- Column Identity

Each column in the grid is identified by a `PlTableColumnIdJson`, which is the canonicalized JSON of:

```ts
type PlTableColumnId = {
  source: PTableColumnSpec; // original spec from fullTableHandle
  labeled: PTableColumnSpec; // spec after label-column replacement (may differ for axes)
};
```

This two-part identity is necessary because the same visual column may display data from a label column while logically representing an axis. The `source` preserves the logical identity; the `labeled` captures the data source. This structure is used for:

- Column visibility persistence (`hiddenColIds`)
- Column ordering persistence (`orderedColIds`)
- Sort state persistence (`sortModel[].colId`)

---

## Row Number Column

Built by `makeRowNumberColDef()` in `sources/row-number.ts`. Always the first element of `columnDefs`.

| Property           | Value                       |
| ------------------ | --------------------------- |
| `colId`            | `'"##RowNumberColumnId##"'` |
| `headerName`       | `"#"`                       |
| `headerComponent`  | `PlAgRowNumHeader`          |
| `cellRenderer`     | `PlAgRowNumCheckbox`        |
| `lockPosition`     | `"left"`                    |
| `pinned`           | `"left"`                    |
| `lockPinned`       | `true`                      |
| `width`            | `45` (initial)              |
| `sortable`         | `false`                     |
| `resizable`        | `false`                     |
| `mainMenuItems`    | `[]` (empty)                |
| `contextMenuItems` | `[]` (empty)                |

Width is dynamically adjusted by `autoSizeRowNumberColumn()` based on the widest displayed row number.

---

## Data Fetching Integration

The `fields` and `indices` arrays feed into both column definitions and the server-side datasource:

1. `fields` array: used as `ColDef.field` values and as keys in `PlAgDataTableV2Row`.
2. `specsToVisibleSpecsMapping`: maps each field index to a `visibleTableSpecs` index (or `-1` for hidden).
3. `requestIndices`: deduplicated array of visible-spec indices to request from the driver, including all visible axes.
4. `fieldResultMapping`: for each field, the index into the response columns array, or `-1` if that field has no visible data.

In `columns2rows()`, each row is built by iterating `fields`: if `fieldResultMapping[iCol]` is `-1`, the cell value is `PTableHidden`; otherwise, the value is extracted from the response column at the mapped index.

---

## Annotations Reference

Annotations consumed during column definition construction:

| Annotation key                | Constant path                    | Read by                              | Effect                                                              |
| ----------------------------- | -------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `pl7.app/label`               | `Annotation.Label`               | `makeColDef`                         | Sets `headerName`                                                   |
| `pl7.app/description`         | `Annotation.Description`         | `makeColDef`                         | Sets header tooltip (read from `labeledSpec`)                       |
| `pl7.app/table/visibility`    | `Annotation.Table.Visibility`    | `isColumnHidden`, `isColumnOptional` | `"hidden"`: column excluded; `"optional"`: column hidden by default |
| `pl7.app/table/orderPriority` | `Annotation.Table.OrderPriority` | sorting step                         | Higher numeric value = column placed further left                   |
| `pl7.app/table/fontFamily`    | `Annotation.Table.FontFamily`    | `getColumnRenderingSpec`             | Sets cell font family                                               |
| `pl7.app/format`              | `Annotation.Format`              | `getColumnRenderingSpec`             | d3-format string for numeric formatting                             |
| `pl7.app/isLinkerColumn`      | `Annotation.IsLinkerColumn`      | `isLinkerColumnSpec`                 | `true`: column excluded from table                                  |

---

## Source Files

| File                                                              | Contains                                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `sources/table-source-v2.ts`                                      | `calculateGridOptions()`, `makeColDef()`, `PlAgCellButtonAxisParams`, `columns2rows()`  |
| `sources/common.ts`                                               | `PTableHidden` sentinel, `isPTableHidden()`                                             |
| `sources/value-rendering.ts`                                      | `getColumnRenderingSpec()`, `formatSpecialValues()`, `ColumnRenderingSpec`              |
| `sources/row-number.ts`                                           | `makeRowNumberColDef()`, `autoSizeRowNumberColumn()`, `PlAgDataTableRowNumberColId`     |
| `sources/menu-items.ts`                                           | `defaultMainMenuItems()`                                                                |
| `lib/model/common/src/drivers/pframe/spec/spec.ts`                | `Annotation`, `ValueType`, `isLabelColumn`, `isLinkerColumn`, `AxisSpec`, `PColumnSpec` |
| `lib/model/common/src/drivers/pframe/table_common.ts`             | `PTableColumnSpec`, `PTableColumnId`, `getPTableColumnId`                               |
| `sdk/model/src/components/PlDataTable/typesV5.ts`                 | `PlTableColumnId`, `PlTableColumnIdJson`, `PlDataTableModel`                            |
| `sdk/model/src/components/PlDataTable/createPlDataTable/utils.ts` | `isColumnHidden()`, `isColumnOptional()`, `getEffectiveVisibility()`                    |
