# Row Number Column: Technical Specification

## Overview

The row number column is a synthetic, non-data column prepended to every PlAgDataTable grid.
It displays 1-based row indices, doubles as a per-row selection checkbox, and auto-sizes its
width to fit the digit count of the largest visible row number.

Source file: `sources/row-number.ts`
Header component: `PlAgRowNumHeader.vue`
Cell component: `PlAgRowNumCheckbox/PlAgRowNumCheckbox.vue`

---

## Exported Symbols

| Symbol                             | Type                                            | Purpose                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PlAgDataTableRowNumberColId`      | `string` constant (`'"##RowNumberColumnId##"'`) | Stable column identifier used to reference the row number column in API calls and state                                                  |
| `makeRowNumberColDef<TData>()`     | `() => ColDef<TData>`                           | Returns the column definition object; called during column definitions assembly in `table-source-v2.ts`                                  |
| `autoSizeRowNumberColumn(gridApi)` | `(GridApi) => void`                             | Attaches all event listeners for width adjustment, cell refresh, column ordering, and cleanup; called from `onGridReady` in `useGrid.ts` |

---

## Column Definition (`makeRowNumberColDef`)

Returns a `ColDef` with the following properties:

| Property            | Value                         | Rationale                                     |
| ------------------- | ----------------------------- | --------------------------------------------- |
| `colId`             | `PlAgDataTableRowNumberColId` | Stable ID for programmatic access             |
| `headerName`        | `"#"`                         | Displayed when selection is not enabled       |
| `headerComponent`   | `PlAgRowNumHeader`            | Custom header with select-all checkbox        |
| `valueGetter`       | `params.node.rowIndex + 1`    | 1-based row number from the display index     |
| `cellRenderer`      | `PlAgRowNumCheckbox`          | Row number text with hover-activated checkbox |
| `lockPosition`      | `"left"`                      | Prevents drag reordering                      |
| `pinned`            | `"left"`                      | Always pinned to the left edge                |
| `lockPinned`        | `true`                        | User cannot unpin                             |
| `suppressMovable`   | `true`                        | Drag handle hidden                            |
| `suppressNavigable` | `true`                        | Keyboard navigation skips this column         |
| `suppressSizeToFit` | `true`                        | Excluded from `sizeColumnsToFit`              |
| `suppressAutoSize`  | `true`                        | Excluded from auto-size operations            |
| `sortable`          | `false`                       | No sort on row numbers                        |
| `resizable`         | `false`                       | No manual resize                              |
| `width`             | `45` (constant `HeaderSize`)  | Initial width; adjusted dynamically           |
| `mainMenuItems`     | `[]`                          | No header menu                                |
| `contextMenuItems`  | `[]`                          | No context menu                               |
| `headerClass`       | `"pl-ag-header-align-center"` | Centers header content                        |
| `cellStyle`         | See below                     | Inline styling for cell appearance            |

**Cell style object:**

```
{
  color: "var(--txt-03)",
  background-color: "var(--bg-base-light)",
  overflow: "visible !important",
  text-align: "center"
}
```

---

## Auto-Sizing Mechanism

### Initialization (`autoSizeRowNumberColumn`)

Called once from the `onGridReady` callback in `useGrid.ts`. Performs three actions immediately:

1. Creates a hidden DOM measurement element (`cellFake`).
2. Calls `adjustRowNumberColumnWidth` for the current viewport.
3. Calls `fixColumnOrder` to ensure correct column position.

Then registers event listeners (detailed below) and a cleanup handler on `gridPreDestroyed`.

### DOM Measurement Element (`createCellFake` / `destroyCellFake`)

A `<div>` appended to `document.body` with the following styles:

| Style        | Value        | Purpose                                |
| ------------ | ------------ | -------------------------------------- |
| `visibility` | `hidden`     | Not visible but participates in layout |
| `position`   | `absolute`   | Out of document flow                   |
| `boxSizing`  | `border-box` | Width includes padding and border      |
| `padding`    | `15.5px`     | Matches cell padding                   |
| `border`     | `1px solid`  | Matches cell border                    |
| `width`      | `auto`       | Shrink-wraps to content                |

The element is removed from the DOM on `gridPreDestroyed`.

### Width Calculation (`adjustRowNumberColumnWidth`)

Signature: `(gridApi, cellFake, force?) => void`

Steps:

1. Get the row node at the last displayed row index via `gridApi.getDisplayedRowAtIndex(gridApi.getLastDisplayedRowIndex())`.
2. Read the cell value for `PlAgDataTableRowNumberColId` on that row node.
3. If the value is not a number, return early.
4. Compute digit count: `lastDisplayedRowNumber.toString().length`.
5. **Short-circuit**: if `force` is not set and `cellFake.innerHTML.length` already equals the digit count, return (no change needed).
6. Set `cellFake.innerHTML` to the character `"5"` repeated `digitCount` times. The digit 5 is used because it is the widest Arabic numeral in most proportional fonts.
7. On `nextTick` (Vue), apply column state with width = `Math.max(HeaderSize, cellFake.offsetWidth)` and `pinned: "left"` (re-applied as a workaround for a pinning bug).

The `nextTick` deferral ensures the DOM measurement element has been laid out by the browser before `offsetWidth` is read.

---

## Column Position Enforcement (`fixColumnOrder`)

Signature: `(gridApi) => void`

Ensures the row number column is always at the leftmost position, with one exception: if a built-in ag-grid selection column exists, the selection column occupies index 0 and the row number column occupies index 1.

Logic:

1. If `gridApi.isDestroyed()`, return.
2. Get all grid columns. Find the index of the selection column (`isColumnSelectionCol`) and the row number column.
3. If the row number column is not found, do nothing.
4. If the selection column exists and the pair is not already at positions [0, 1], call `gridApi.moveColumns([rowNumberCol, selectionCol], 0)`.
5. If no selection column exists and row number is not at index 0, call `gridApi.moveColumns([rowNumberCol], 0)`.

---

## Event Listeners

### Width Adjustment Events

| Event               | Condition                                                                                                                              | Action                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `firstDataRendered` | Always                                                                                                                                 | `adjustRowNumberColumnWidth(api, cellFake)`                |
| `viewportChanged`   | Always                                                                                                                                 | `adjustRowNumberColumnWidth(api, cellFake)`                |
| `columnVisible`     | Only if the event's columns include the row number column and it became visible                                                        | `adjustRowNumberColumnWidth(api, cellFake)`                |
| `columnResized`     | Only if `event.finished` is true, `event.source` is `"autosizeColumns"`, and the event's columns include the visible row number column | `adjustRowNumberColumnWidth(api, cellFake, true)` (forced) |

The `columnResized` handler uses `force: true` to bypass the digit-count short-circuit. This covers the case where an external auto-size operation overrides the column width.

### Cell Refresh Events

| Event           | Action               |
| --------------- | -------------------- |
| `sortChanged`   | `api.refreshCells()` |
| `filterChanged` | `api.refreshCells()` |
| `modelUpdated`  | `api.refreshCells()` |

These events invalidate the mapping between row indices and data rows. A full cell refresh forces the `valueGetter` to re-evaluate `rowIndex + 1` for every visible cell.

### Column Order Events

| Event                     | Action                |
| ------------------------- | --------------------- |
| `displayedColumnsChanged` | `fixColumnOrder(api)` |

Fires when columns are reordered, added, or removed. Ensures the row number column is repositioned to index 0 (or 1 if a selection column exists).

### Cleanup

| Event              | Action                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- |
| `gridPreDestroyed` | `destroyCellFake(cellFake)` -- removes the measurement `<div>` from `document.body` |

---

## Header Component (`PlAgRowNumHeader`)

File: `PlAgRowNumHeader.vue`

Receives `IHeaderParams` as props.

**Behavior:**

- When selection is enabled (`isSelectionEnabled(api)` returns true): renders a `PlCheckbox` for select-all / deselect-all.
- When selection is not enabled: renders the header display name (`"#"`).

**Reactive state:**

| Ref                | Source                      | Update Events                                        |
| ------------------ | --------------------------- | ---------------------------------------------------- |
| `selectedRowCount` | `getSelectedRowsCount(api)` | `selectionChanged`, `rowDataUpdated`, `modelUpdated` |
| `totalRowCount`    | `getTotalRowsCount(api)`    | `selectionChanged`, `rowDataUpdated`, `modelUpdated` |
| `isSelectable`     | `isSelectionEnabled(api)`   | `stateUpdated`                                       |

**Checkbox state:**

| Computed           | Value                                                    |
| ------------------ | -------------------------------------------------------- |
| `someRowsSelected` | `selectedRowCount > 0`                                   |
| `allRowsSelected`  | `someRowsSelected && selectedRowCount === totalRowCount` |

Checkbox shows indeterminate state when `someRowsSelected && !allRowsSelected`. Clicking toggles between `selectAll()` and `deselectAll()`.

All listeners are registered in `onBeforeMount` and removed in `onBeforeUnmount`.

---

## Cell Component (`PlAgRowNumCheckbox`)

File: `PlAgRowNumCheckbox/PlAgRowNumCheckbox.vue`

Receives `ICellRendererParams` as props.

**Behavior:**

Renders a container with two overlapping elements:

1. A text element showing the row number (`params.value`), visible when the row is not selected.
2. A `PlCheckbox`, hidden by default and shown on hover (when selection is allowed) or when the row is selected.

**Reactive state:**

| Ref / Computed                 | Source                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------- | --- | ------------------------ |
| `isChecked` (ref)              | `props.params.node.isSelected()` -- updated via `rowSelected` event listener |
| `forceShowCheckbox` (computed) | `isChecked                                                                   |     | isSelectionEnabled(api)` |
| `allowedSelection` (ref)       | `isSelectionEnabled(api)`                                                    |

**Selection logic:**

`setSelection(val)` calls `params.node.setSelected(val)` only if `isSelectionEnabled(api)` is true.

**CSS visibility rules (from `pl-ag-row-num-checkbox.module.scss`):**

| Condition                                   | Text visible               | Checkbox visible |
| ------------------------------------------- | -------------------------- | ---------------- |
| Default, not selected                       | Yes                        | No               |
| Row hovered, selection allowed              | No                         | Yes              |
| Row selected                                | No                         | Yes              |
| Row hovered (any state via `.ag-row-hover`) | Depends on selection state | Yes              |

The `.allowed-selection` class is toggled on the container based on `allowedSelection`.

Listeners are registered in `onBeforeMount` and removed in `onBeforeUnmount`.

---

## Integration Points

| Consumer                     | What it uses                                           | How                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `sources/table-source-v2.ts` | `makeRowNumberColDef()`, `PlAgDataTableRowNumberColId` | Prepends the row number column def to the column definitions array                                                                        |
| `compositions/useGrid.ts`    | `autoSizeRowNumberColumn()`                            | Called inside `onGridReady` to attach all dynamic behaviors                                                                               |
| State persistence            | `PlAgDataTableRowNumberColId`                          | The column ID is included in persisted `columnOrder` state; visibility/sort state is not applicable (sortable and resizable are disabled) |

---

## Constants

| Name                          | Value                                         | Usage                                                                |
| ----------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `PlAgDataTableRowNumberColId` | `'"##RowNumberColumnId##"'`                   | Column identifier (note: the value itself contains quote characters) |
| `HeaderSize`                  | `45` (module-private)                         | Minimum column width in pixels; also the initial width               |
| `WidestDigit`                 | `"5"` (local to `adjustRowNumberColumnWidth`) | Character used for width measurement                                 |
