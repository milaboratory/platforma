# GridApi Proxy

Keeps `gridOptions` shallowRef in sync with actual AG Grid state so Vue reactivity works on `gridOptions` reads.

Source: `compositions/useGrid.ts` (`useGrid` composable, `onGridReady` handler).

---

## Problem

AG Grid's `GridApi.setGridOption` and `GridApi.updateGridOptions` mutate the grid's internal state directly. Vue's `shallowRef<GridOptions>` is unaware of these mutations. Downstream watchers and computed properties that read `gridOptions.value` (column defs, overlay params, loading state, initial state, status bar) would never re-evaluate.

---

## Solution

A `Proxy` wraps the real `GridApi` instance. Two methods are intercepted; all others pass through via `Reflect.get`.

---

## Lifecycle

| Step | Action                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `useGrid` creates `gridApi = shallowRef<GridApi \| null>(null)` and `gridOptions = shallowRef<GridOptions>(...)` with default options. |
| 2    | AG Grid emits `onGridReady` with the real `GridApi` (`event.api`).                                                                     |
| 3    | Inside `onGridReady`, two replacement functions are defined that close over both `gridOptions` and the real `event.api`.               |
| 4    | A `new Proxy(event.api, handler)` is created and assigned to `gridApi.value`.                                                          |
| 5    | All consumers (watchers, template, datasource) receive the proxied `GridApi`.                                                          |
| 6    | On `onGridPreDestroyed`, `gridApi.value` is set to `null`.                                                                             |

---

## Proxy Handler

The handler uses a single `get` trap. No `set`, `has`, `deleteProperty`, or other traps are defined.

```
get(target, prop, receiver)
  switch (prop)
    "setGridOption"   -> return intercepted setGridOption
    "updateGridOptions" -> return intercepted updateGridOptions
    default           -> Reflect.get(target, prop, receiver)
```

---

## Intercepted Methods

### setGridOption

Signature: `(key: ManagedGridOptionKey, value: GridOptions[ManagedGridOptionKey]) => void`

Procedure:

1. Shallow-copy `gridOptions.value` into a new object.
2. Assign `options[key] = value` on the copy.
3. Write the copy back to `gridOptions.value` (triggers Vue shallowRef reactivity).
4. Call `api.setGridOption(key, value)` on the real API.

The shallow copy is necessary because `shallowRef` only triggers watchers on reference identity change, not on property mutation.

### updateGridOptions

Signature: `(options: ManagedGridOptions) => void`

Procedure:

1. Spread `gridOptions.value` and the incoming `options` into a new object.
2. Write the merged object back to `gridOptions.value` (triggers Vue shallowRef reactivity).
3. Call `api.updateGridOptions(options)` on the real API.

---

## Ordering: Ref Update Before API Call

Both interceptors update `gridOptions.value` before calling the real API method. This guarantees that any synchronous AG Grid callback triggered by the real API call (e.g., `onStateUpdated`) will see the already-updated `gridOptions.value`.

---

## Pass-Through Methods

All other `GridApi` properties and methods (`getState`, `isDestroyed`, `autoSizeColumns`, `hideOverlay`, `showNoRowsOverlay`, `setServerSideSelectionState`, `getServerSideSelectionState`, `getServerSideGroupLevelState`, `getAllDisplayedColumns`, `exportDataAsCsv`, etc.) are forwarded to the real API via `Reflect.get(target, prop, receiver)` with no modification.

---

## Consumers

### Reads from `gridOptions.value` (reactive)

| Consumer                                         | Properties Read                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `PlAgDataTableV2.vue` settings watcher           | `loadingOverlayComponentParams`, `noRowsOverlayComponentParams`, `defaultColDef` |
| `PlAgDataTableV2.vue` `onStateUpdated`           | `initialState` (write)                                                           |
| `PlAgDataTableV2.vue` `onGridPreDestroyed`       | `initialState` (write)                                                           |
| `PlAgDataTableV2.vue` reload watcher             | `initialState` (write)                                                           |
| `PlAgDataTableV2.vue` `watchEffect` (status bar) | `loading`                                                                        |
| `useFilterableColumns`                           | `columnDefs`                                                                     |

### Writes through `gridApi.value` (proxied)

| Call Site                                  | Method              | Key(s)                                                                           |
| ------------------------------------------ | ------------------- | -------------------------------------------------------------------------------- |
| Settings watcher (no source)               | `updateGridOptions` | `loading`, `loadingOverlayComponentParams`, `columnDefs`, `serverSideDatasource` |
| Settings watcher (source changed)          | `updateGridOptions` | `loading`, `loadingOverlayComponentParams`                                       |
| Settings watcher (model updated, skeleton) | `updateGridOptions` | `serverSideDatasource`                                                           |
| Settings watcher (model ready)             | `updateGridOptions` | `columnDefs`, `serverSideDatasource`, `loading`, `loadingOverlayComponentParams` |
| `cellRendererSelector` watcher             | `setGridOption`     | `defaultColDef`                                                                  |
| Overlay text watcher                       | `updateGridOptions` | `loadingOverlayComponentParams`, `noRowsOverlayComponentParams`                  |
| Status bar `watchEffect`                   | `updateGridOptions` | `statusBar`                                                                      |
| `table-source-v2.ts` datasource            | `setGridOption`     | `loading`                                                                        |

---

## Type Safety

The proxy is typed as `GridApi<PlAgDataTableV2Row>`. TypeScript sees the original `GridApi` type; the proxy's method replacements match the original signatures (`ManagedGridOptionKey`, `ManagedGridOptions`). No type assertion or cast is used on the proxy itself -- `new Proxy(api, handler)` returns `GridApi<PlAgDataTableV2Row>` because `api` is that type.

---

## Invariants

1. `gridApi.value` is `null` before `onGridReady` and after `onGridPreDestroyed`.
2. `gridOptions.value` always reflects the last known grid option state (may lag behind AG Grid internal state for options changed through pass-through methods or AG Grid's own UI interactions).
3. Every `setGridOption`/`updateGridOptions` call through the proxy produces a new `gridOptions.value` reference (triggering Vue reactivity).
4. The proxy does not intercept reads of grid option properties from the API. Reading options is done through `gridOptions.value`, not `gridApi.value`.

---

## Limitations

- Options changed by AG Grid internally (e.g., column state mutations from user drag-and-drop) are not reflected in `gridOptions.value`. Those are captured separately via `onStateUpdated`.
- The `params.api` inside the server-side datasource `getRows` callback is the real `GridApi`, not the proxy. Calls to `params.api.setGridOption("loading", ...)` inside the datasource bypass the proxy and do not update `gridOptions.value`. The status bar `watchEffect` works around this by reading `gridOptions.value.loading` which is set through the proxy in other code paths.
