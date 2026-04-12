# Data Flow: Overlay Management

## Overview

ag-grid displays at most one overlay at a time. PlAgDataTable uses two custom overlay components (`PlAgOverlayLoading`, `PlAgOverlayNoRows`) and a status bar component (`PlAgRowCount`). The overlay shown depends on two grid options: `loading` (boolean) and the current row count.

## Overlay Priority

| Condition                          | Overlay Shown        | Status Bar               |
| ---------------------------------- | -------------------- | ------------------------ |
| `loading === true`                 | `PlAgOverlayLoading` | Hidden                   |
| `loading === false`, row count = 0 | `PlAgOverlayNoRows`  | Hidden                   |
| `loading === false`, row count > 0 | None (data visible)  | Visible (`PlAgRowCount`) |

ag-grid enforces mutual exclusivity: only one overlay renders at any time. When transitioning from `PlAgOverlayNoRows` to `PlAgOverlayLoading`, `hideOverlay()` must be called first, because ag-grid will not replace one overlay with another automatically.

## Components

### PlAgOverlayLoading

**File:** `PlAgOverlayLoading.vue`

Registered via `loadingOverlayComponent` in `useGrid`. Shown whenever `loading === true`.

Has three visual variants controlled by `PlAgOverlayLoadingParams.variant`:

| Variant       | Visual                                            | Default Text                                                  |
| ------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `"not-ready"` | Cat-in-bag icon (`loading-cat.png`) + `<h3>` text | `"Data is not computed"`                                      |
| `"running"`   | `PlPlaceholder` with `variant="table"`            | `PL_PLACEHOLDER_TEXTS.RUNNING` (i.e. `"Running analysis..."`) |
| `"loading"`   | `PlPlaceholder` with `variant="table"`            | `PL_PLACEHOLDER_TEXTS.LOADING` (i.e. `"Loading data..."`)     |

For `"running"` and `"loading"` variants, the text is resolved through `normalizePlaceholderText()`: if the override is a string, it becomes `{ title: string }`; if it is an object with `title` and `subtitle`, it passes through unchanged.

**Refresh mechanism:** ag-grid calls the exposed `refresh(newParams)` method when `loadingOverlayComponentParams` changes at runtime. The component stores params in a `ref` and updates it in `refresh`, making the overlay reactive without remounting.

### PlAgOverlayNoRows

**File:** `PlAgOverlayNoRows.vue`

Registered via `noRowsOverlayComponent` in `useGrid`. Shown when ag-grid determines there are zero rows and no loading overlay is active. Must be triggered explicitly via `api.showNoRowsOverlay()`.

| Element | Visual                             |
| ------- | ---------------------------------- |
| Icon    | Sad-cat image (`no-data-cat.png`)  |
| Text    | `params.text` or default `"Empty"` |

Same refresh mechanism as `PlAgOverlayLoading`: exposes `refresh(newParams)` to update `PlAgOverlayNoRowsParams` reactively.

### PlAgRowCount (Status Bar)

**File:** `PlAgRowCount.vue`

Not an overlay. Registered as an ag-grid status panel. Conditionally attached: the `statusBar` grid option is set to `undefined` when `loading === true` and to `{ statusPanels: [{ statusPanel: PlAgRowCount, align: "left" }] }` when `loading === false`. This is enforced by a `watchEffect` in `PlAgDataTableV2.vue`.

**Displayed text format:** `"{totalRows} row(s)"` with optional `" ({selectedRows} selected)"` suffix when selection count > 0. Uses `Intl.PluralRules("en")` for pluralization and `Intl.NumberFormat("en")` for number formatting.

**Event listeners:** subscribes to three ag-grid events to stay current:

| Event              | Purpose                         |
| ------------------ | ------------------------------- |
| `selectionChanged` | Update selected row count       |
| `rowDataUpdated`   | Update total row count          |
| `modelUpdated`     | Update total/selected row count |

**Row count computation** (from `selection.ts`):

- `getTotalRowsCount(api)`: returns `0` when `loading === true`, otherwise `api.getDisplayedRowCount()`.
- `getSelectedRowsCount(api)`: returns `0` when `loading === true`. For server-side row model, reads `api.getServerSideSelectionState().toggledNodes.length`.

## Type Definitions

**File:** `types.ts`

### PlAgOverlayLoadingParams

```typescript
type PlAgOverlayLoadingParams = {
  variant: "not-ready" | "running" | "loading";
  loadingText?: string | { title: string; subtitle: string | string[] };
  runningText?: string | { title: string; subtitle: string | string[] };
  notReadyText?: string;
};
```

| Field          | Used by variant | Default                        |
| -------------- | --------------- | ------------------------------ |
| `loadingText`  | `"loading"`     | `PL_PLACEHOLDER_TEXTS.LOADING` |
| `runningText`  | `"running"`     | `PL_PLACEHOLDER_TEXTS.RUNNING` |
| `notReadyText` | `"not-ready"`   | `"Data is not computed"`       |

### PlAgOverlayNoRowsParams

```typescript
type PlAgOverlayNoRowsParams = {
  text?: string;
};
```

Default text when `text` is undefined: `"Empty"`.

## Registration (useGrid)

**File:** `compositions/useGrid.ts`

Overlay components and their initial params are set in the `gridOptions` object returned by `useGrid`:

```typescript
{
  loading: true,
  loadingOverlayComponent: PlOverlayLoading,
  loadingOverlayComponentParams: {
    variant: "not-ready",
    loadingText,
    runningText,
    notReadyText,
  },
  noRowsOverlayComponent: PlOverlayNoRows,
  noRowsOverlayComponentParams: {
    text: noRowsText,
  },
}
```

Initial state is `loading: true` with `variant: "not-ready"`. The custom text props (`loadingText`, `runningText`, `notReadyText`, `noRowsText`) are forwarded from the `useGrid` call site, which receives them from `PlAgDataTableV2` component props.

## State Transitions (PlAgDataTableV2.vue)

The settings watcher (`watch(() => [gridApi.value, settings.value]...)`) drives all overlay state transitions. There is also a separate watcher for text prop changes and a `watchEffect` for the status bar.

### Settings Watcher Transitions

Every entry into the settings watcher begins with:

```typescript
gridApi.hideOverlay();
dataRenderedTracker.reset();
```

This ensures any existing `PlAgOverlayNoRows` is dismissed before `loading` is set to `true` (ag-grid would otherwise ignore the loading overlay).

#### Case 1: `settings.sourceId === null`

No data source is available. The settings object carries a `pending` boolean.

| `settings.pending` | `loading` | `variant`     |
| ------------------ | --------- | ------------- |
| `false`            | `true`    | `"not-ready"` |
| `true`             | `true`    | `"running"`   |

```typescript
gridApi.updateGridOptions({
  loading: true,
  loadingOverlayComponentParams: {
    ...existing,
    variant: settings.pending ? "running" : "not-ready",
  },
  columnDefs: undefined,
  serverSideDatasource: undefined,
});
```

#### Case 2: `settings.sourceId` changed (new data source)

```typescript
gridApi.updateGridOptions({
  loading: true,
  loadingOverlayComponentParams: {
    ...existing,
    variant: "loading",
  },
});
```

#### Case 3: Model not yet ready or source mismatch

When `settings.model` is undefined or `settings.model.sourceId !== settings.sourceId`, the watcher installs a stub datasource that returns empty rows. The `loading` overlay remains active from Case 2.

#### Case 4: Model ready — `calculateGridOptions` resolves

`calculateGridOptions` is called asynchronously. On resolution, `gridApi.updateGridOptions(result)` sets new `columnDefs` and `serverSideDatasource`. The `loading` flag is **not** set to `false` here; that happens inside the datasource's `getRows` callback.

In the `.finally()` block:

```typescript
gridApi.updateGridOptions({ loading: false });
```

This acts as a fallback to remove the loading overlay after the async pipeline completes.

#### Case 5: Zero rows from server

Inside `getRows` in `table-source-v2.ts`, when `rowCount === 0`:

```typescript
params.success({ rowData: [], rowCount });
params.api.setGridOption("loading", false);
params.api.showNoRowsOverlay();
```

Order matters: `loading` must be set to `false` before `showNoRowsOverlay()`, because ag-grid will not show the no-rows overlay while a loading overlay is active.

#### Case 6: Data rows available from server

Inside `getRows`, after successful data fetch:

```typescript
params.success({ rowData, rowCount });
params.api.setGridOption("loading", false);
dataRenderedTracker.resolve(params.api);
```

No overlay is shown. The status bar becomes visible via the `watchEffect`.

#### Case 7: Data fetch error

Inside `getRows` catch block:

```typescript
params.api.setGridOption("loading", true);
params.fail();
```

Reverts to loading overlay on error.

### Text Props Watcher

A separate watcher observes `loadingText`, `runningText`, `notReadyText`, and `noRowsText` props. When any changes:

```typescript
gridApi.updateGridOptions({
  loadingOverlayComponentParams: {
    ...existing,
    loadingText,
    runningText,
    notReadyText,
  },
  noRowsOverlayComponentParams: {
    ...existing,
    text: noRowsText,
  },
});
```

This triggers the `refresh()` method on the currently mounted overlay component, allowing text changes without remounting.

### Status Bar watchEffect

```typescript
watchEffect(() => {
  gridApi.updateGridOptions({
    statusBar: gridOptions.loading
      ? undefined
      : { statusPanels: [{ statusPanel: PlAgRowCount, align: "left" }] },
  });
});
```

Tracks the `loading` property reactively. Removes the status bar during loading states; adds it back when loading completes.

## Complete State Machine

```
                                 ┌──────────────────────────┐
                                 │  Initial State           │
                                 │  loading=true            │
                                 │  variant="not-ready"     │
                                 └────────────┬─────────────┘
                                              │
                                    settings watcher fires
                                              │
               ┌──────────────────────────────┼──────────────────────────────┐
               │                              │                              │
    sourceId === null                sourceId changed              model ready
               │                              │                              │
     ┌─────────┴─────────┐                    │                              │
     │                    │                    │                    calculateGridOptions()
  pending=false       pending=true             │                              │
     │                    │                    │               ┌──────────────┴──────────────┐
  variant=             variant=             variant=           │                             │
  "not-ready"          "running"            "loading"       getRows:                      getRows:
  loading=true         loading=true         loading=true    rowCount=0                    rowCount>0
                                                              │                             │
                                                           loading=false                 loading=false
                                                           showNoRowsOverlay()           no overlay
                                                              │                             │
                                                           PlAgOverlayNoRows             data visible
                                                           (sad cat)                     PlAgRowCount
```

## Styling

### PlAgOverlayLoading

**File:** `pl-ag-overlay-loading.module.scss`

| Class              | Layout                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `.container`       | Full height/width, flex centered, `color: var(--txt-mask)`                               |
| `.notReadyWrapper` | Full height/width, flex column centered, `background-color: var(--bg-base-light)`        |
| `.iconCatInBag`    | `background-image: url(./assets/loading-cat.png)`, 400x212px, `background-size: contain` |
| `.text`            | `margin-top: 24px`, `white-space: pre`                                                   |

### PlAgOverlayNoRows

Uses global CSS classes (not CSS modules):

| Class                            | Layout                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `.grid-overlay-container`        | Full height (`calc(100% - 1px)`), flex column centered, `background-color: var(--bg-base-light)` |
| `.grid-icon-sad-cat`             | `background-image: url(./assets/no-data-cat.png)`, 300x300px, `background-size: contain`         |
| `.grid-overlay-container > span` | `color: var(--txt-mask)`                                                                         |

## Props Passed from PlAgDataTableV2

| PlAgDataTableV2 Prop | Target               | Mapped To                               |
| -------------------- | -------------------- | --------------------------------------- |
| `loadingText`        | `PlAgOverlayLoading` | `PlAgOverlayLoadingParams.loadingText`  |
| `runningText`        | `PlAgOverlayLoading` | `PlAgOverlayLoadingParams.runningText`  |
| `notReadyText`       | `PlAgOverlayLoading` | `PlAgOverlayLoadingParams.notReadyText` |
| `noRowsText`         | `PlAgOverlayNoRows`  | `PlAgOverlayNoRowsParams.text`          |
