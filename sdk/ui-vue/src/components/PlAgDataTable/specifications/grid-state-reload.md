# Data Flow: Grid State Reload

## Overview

When `gridState` changes from an external source (e.g. state restored from cache on source switch),
the component must determine whether the running ag-grid instance already reflects that state.
If it does not, the entire `AgGridVue` component is re-mounted via a `reloadKey` increment so that
the new state is applied as `initialState`.

Entry point: watcher on `[gridApi, gridState]` in `PlAgDataTableV2.vue` (lines 254-272).

---

## Participating Symbols

| Symbol                        | Kind                                            | Location                      | Role                                                                                            |
| ----------------------------- | ----------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `reloadKey`                   | `Ref<number>`                                   | `PlAgDataTableV2.vue`         | Vue `:key` on `<AgGridVue>`. Incrementing forces unmount + remount.                             |
| `isReloading`                 | `let boolean`                                   | `PlAgDataTableV2.vue`         | Guard flag. `true` during the synchronous unmount-remount tick.                                 |
| `gridState`                   | `WritableComputedRef<PlDataTableGridStateCore>` | returned by `useTableState()` | External grid state (from cache / parent model).                                                |
| `gridApi`                     | `ShallowRef<GridApi \| null>`                   | returned by `useGrid()`       | Current ag-grid API instance. Set on `onGridReady`, cleared on `onGridPreDestroyed`.            |
| `gridOptions.initialState`    | `GridState \| undefined`                        | `PlAgDataTableV2.vue`         | Read by ag-grid on mount. Updated before `reloadKey` increment so the new instance picks it up. |
| `stateForReloadCompare()`     | `function`                                      | `PlAgDataTableV2.vue`         | Normalizes `columnVisibility` for comparison purposes.                                          |
| `makePartialState()`          | `function`                                      | `PlAgDataTableV2.vue`         | Extracts `PlDataTableGridStateCore` from full ag-grid `GridState`.                              |
| `normalizeColumnVisibility()` | `function`                                      | `PlAgDataTableV2.vue`         | Resolves ambiguity when ag-grid returns `columnVisibility: undefined`.                          |
| `onGridPreDestroyed`          | event handler                                   | `PlAgDataTableV2.vue`         | Captures ag-grid state on unmount, unless `isReloading` is `true`.                              |

---

## Detailed Flow

### Step 1: Watcher trigger

```
watch(
  () => [gridApi.value, gridState.value] as const,
  ...
)
```

Fires when either `gridApi` or `gridState` changes. This covers two scenarios:

| Scenario                | What changes | Typical cause                                                                             |
| ----------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| External state restore  | `gridState`  | User switches sourceId; cached state for the new source is loaded.                        |
| Grid ready after reload | `gridApi`    | After `reloadKey` increment, new ag-grid instance fires `onGridReady` and sets `gridApi`. |

### Step 2: Guard checks

The handler exits early (no-op) in two cases:

| Condition                                      | Reason                                                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gridApi` is `null` or `gridApi.isDestroyed()` | No live grid instance to compare against.                                                                                                                   |
| `isJsonEqual(gridState, {})`                   | Empty object means no state has been loaded yet (default state from `makeDefaultState()`). Reloading with `{}` would wipe any existing column order / sort. |

### Step 3: State comparison

```ts
const selfState = makePartialState(gridApi.getState());
```

The current ag-grid state is read via `gridApi.getState()` and reduced to `PlDataTableGridStateCore`
by `makePartialState()`, which extracts only three fields: `columnOrder`, `sort`, `columnVisibility`.

Both sides are normalized via `stateForReloadCompare()` before comparison:

```ts
!isJsonEqual(stateForReloadCompare(gridState), stateForReloadCompare(selfState));
```

### Step 4: `stateForReloadCompare()` normalization

```ts
function stateForReloadCompare(state: PlDataTableGridStateCore): PlDataTableGridStateCore {
  const cv = state.columnVisibility;
  const normalizedCv = !cv || cv.hiddenColIds.length === 0 ? undefined : state.columnVisibility;
  return { ...state, columnVisibility: normalizedCv };
}
```

Purpose: ag-grid treats "all columns visible" as `columnVisibility: undefined`, while
the persistence layer may store it as `{ hiddenColIds: [] }`. These two representations
are semantically identical. The function collapses both to `undefined` so they compare
as equal and do not trigger a spurious reload.

| Input `columnVisibility`             | Normalized output                                |
| ------------------------------------ | ------------------------------------------------ |
| `undefined`                          | `undefined`                                      |
| `{ hiddenColIds: [] }`               | `undefined`                                      |
| `{ hiddenColIds: ["col1", "col2"] }` | `{ hiddenColIds: ["col1", "col2"] }` (unchanged) |

### Step 5: Reload execution

If the normalized states differ:

```ts
isReloading = true;
gridOptions.value.initialState = gridState;
++reloadKey.value;
nextTick(() => {
  isReloading = false;
});
```

Sequence of events within a single synchronous + microtask cycle:

| Phase                 | Action                     | Detail                                                                                                                            |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Synchronous           | `isReloading = true`       | Prevents `onGridPreDestroyed` from persisting the old state.                                                                      |
| Synchronous           | `initialState = gridState` | Sets the state the new ag-grid instance will initialize with.                                                                     |
| Synchronous           | `++reloadKey.value`        | Marks the reactive dependency dirty.                                                                                              |
| Vue patch (same tick) | `<AgGridVue>` unmounts     | Old instance fires `onGridPreDestroyed`. Handler sees `isReloading === true` and skips state capture. `gridApi` is set to `null`. |
| Vue patch (same tick) | `<AgGridVue>` mounts       | New instance reads `gridOptions.initialState`. Fires `onGridReady`, which sets `gridApi` to the new API proxy.                    |
| `nextTick` callback   | `isReloading = false`      | Guard cleared. Subsequent `onGridPreDestroyed` calls (e.g. from a settings-driven reload) will capture state normally.            |

### Step 6: No-op path

If `isJsonEqual(stateForReloadCompare(gridState), stateForReloadCompare(selfState))` is `true`,
no action is taken. The grid already reflects the desired state.

---

## `isReloading` Guard: Preventing State Overwrite

`onGridPreDestroyed` normally captures the current ag-grid state so it persists across
component lifecycle events:

```ts
gridOptions.value.onGridPreDestroyed = (event) => {
  if (!isReloading) {
    gridOptions.value.initialState = gridState.value = normalizeColumnVisibility(
      makePartialState(event.api.getState()),
      gridState.value,
      event.api,
    );
  }
  gridApi.value = null;
};
```

During a reload, the old grid is being destroyed specifically so it can be replaced with
a grid initialized from a different state. Without the `isReloading` guard, the handler
would capture the stale state of the dying grid and write it back to `gridState`, which
would either:

1. Overwrite the incoming external state with the old state.
2. Trigger the reload watcher again (since `gridState` changed), causing an infinite loop.

| `isReloading` value | `onGridPreDestroyed` behavior                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `false`             | Captures state via `makePartialState` + `normalizeColumnVisibility`, writes to `gridState` and `initialState`. |
| `true`              | Skips state capture entirely. Only clears `gridApi.value = null`.                                              |

---

## `makePartialState()`: Full State to Core State

```ts
function makePartialState(state: GridState): PlDataTableGridStateCore {
  return {
    columnOrder: state.columnOrder as { orderedColIds: PlTableColumnIdJson[] } | undefined,
    sort: state.sort as
      | { sortModel: { colId: PlTableColumnIdJson; sort: "asc" | "desc" }[] }
      | undefined,
    columnVisibility: state.columnVisibility as { hiddenColIds: PlTableColumnIdJson[] } | undefined,
  };
}
```

ag-grid `GridState` contains many fields (scroll position, focused cell, range selection, etc.).
Only three are relevant to `PlDataTableGridStateCore`. This function extracts them and restores
the `PlTableColumnIdJson` type annotations that ag-grid erases to plain `string`.

| `GridState` field  | Extracted | Type cast target                                                         |
| ------------------ | --------- | ------------------------------------------------------------------------ |
| `columnOrder`      | yes       | `{ orderedColIds: PlTableColumnIdJson[] }`                               |
| `sort`             | yes       | `{ sortModel: { colId: PlTableColumnIdJson, sort: "asc" \| "desc" }[] }` |
| `columnVisibility` | yes       | `{ hiddenColIds: PlTableColumnIdJson[] }`                                |
| All other fields   | no        | Discarded                                                                |

---

## `normalizeColumnVisibility()`: Resolving Undefined Ambiguity

Called from both `onGridPreDestroyed` and `onStateUpdated`. Needed because ag-grid does not
distinguish between "no visibility state has been configured" and "all columns are visible."

```ts
function normalizeColumnVisibility(
  partialState: PlDataTableGridStateCore,
  prevState: PlDataTableGridStateCore,
  api: GridApi<PlAgDataTableV2Row>,
): PlDataTableGridStateCore;
```

Decision table:

| `partialState.columnVisibility` | `prevState.columnVisibility` | Result                                                                                                                                             |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Defined (has `hiddenColIds`)    | any                          | Return `partialState` unchanged.                                                                                                                   |
| `undefined`                     | Defined (was explicit)       | Set `{ hiddenColIds: [] }` -- user explicitly made all columns visible.                                                                            |
| `undefined`                     | `undefined` (no prior state) | Compute defaults via `getDefaultHiddenColIds(api)`. If any columns match `isColumnOptional`, hide them. Otherwise return `partialState` unchanged. |

`getDefaultHiddenColIds()` iterates all grid columns and returns those whose `PTableColumnSpec`
satisfies `isColumnOptional()`. These are columns that should be hidden by default when no
explicit user preference exists.

---

## Interaction with `onStateUpdated`

`onStateUpdated` fires whenever ag-grid's internal state changes (sort click, column drag, etc.).
It also writes to `gridState`:

```ts
gridOptions.value.initialState = gridState.value = partialState;
```

This write keeps `initialState` synchronized with `gridState` at all times, so that if `reloadKey`
increments later (for any reason), the new grid instance starts with the latest user-modified state
rather than stale data.

Because `onStateUpdated` writes to `gridState`, it will re-trigger the reload watcher.
However, since `selfState` (from `gridApi.getState()`) and `gridState` will be equal
after `stateForReloadCompare()` normalization, the watcher takes the no-op path.

---

## Edge Cases

| Scenario                                                                  | Behavior                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gridState` is `{}` (empty object)                                        | Watcher exits early. No comparison or reload performed. Prevents wiping existing grid state when no cached state exists.                                                                                         |
| `gridApi` is `null` during state change                                   | Watcher exits early. When grid later mounts and sets `gridApi`, the watcher fires again and performs the comparison.                                                                                             |
| `gridApi.isDestroyed()` is `true`                                         | Watcher exits early. Destroyed API cannot be queried.                                                                                                                                                            |
| Rapid successive `gridState` changes                                      | Each triggers the watcher. Only the comparison against the current grid state matters. If the grid was already reloaded to match an intermediate state, the next watcher invocation compares against that state. |
| `onGridPreDestroyed` during non-reload unmount (e.g. component destroyed) | `isReloading` is `false`, so state is captured and persisted normally.                                                                                                                                           |
| `reloadKey` increment while grid is still initializing                    | The `gridApi` guard (`null` or `isDestroyed()`) prevents action until the grid is fully ready.                                                                                                                   |

---

## Timing Diagram

```
External state change (e.g. sourceId switch triggers cache lookup)
  |
  v
gridState.value = <new state from cache>
  |
  v
Watcher fires: [gridApi (live), gridState (new)]
  |
  v
selfState = makePartialState(gridApi.getState())
  |
  +--> stateForReloadCompare(gridState) === stateForReloadCompare(selfState)?
  |       |
  |       +--> YES: no-op, return
  |       |
  |       +--> NO: continue
  |
  v
isReloading = true
gridOptions.initialState = gridState
++reloadKey
  |
  v  [Vue reactivity: synchronous patch]
  |
  +-- Old AgGridVue unmounts
  |     |
  |     v
  |   onGridPreDestroyed fires
  |     isReloading === true --> skip state capture
  |     gridApi.value = null
  |
  +-- New AgGridVue mounts with initialState = gridState
        |
        v
      onGridReady fires
        gridApi.value = new Proxy(api, ...)
        |
        v
      Watcher fires again: [gridApi (new), gridState (same)]
        selfState matches gridState --> no-op
  |
  v  [nextTick]
isReloading = false
```
