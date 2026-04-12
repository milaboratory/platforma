# Sheet / Partition Filtering: Technical Specification

## Overview

Sheet filtering allows users to select a single value per partitioned axis, producing
per-axis filter specs that restrict the data table to one partition slice. The pipeline:
user-provided `PlDataTableSheet[]` -> normalization -> UI dropdowns -> `PlDataTableSheetState[]`
-> `FilterSpec[]` -> merged into `PTableParamsV2.filters`.

Entry point component: `PlAgDataTableSheets.vue`.
Filter conversion: `convertPartitionFiltersToFilterSpec()` in `sources/table-state-v2.ts`.
Types: `PlDataTableSheetsSettings`, `PlDataTableSheetNormalized` in `types.ts`.

---

## Data Structures

### Input Types

**`PlDataTableSheet`** (`@platforma-sdk/model`, `typesV5.ts`)

```
{
  axis: AxisSpec                           // full axis specification (type, name, domain, annotations, parents)
  options: ListOptionBase<string | number>[]  // dropdown choices ({ label, value, description?, group? })
  defaultValue?: string | number           // metadata-provided default
}
```

**`PlDataTableSheetsSettings`** (`types.ts`)

```
{
  sheets: PlDataTableSheet[]               // user-provided sheets for the current sourceId
  cachedState: PlDataTableSheetState[]     // previously persisted selection (from sheetsState ref)
}
```

Constructed in `PlAgDataTableV2.vue`:

- When `sourceId !== null`: `{ sheets: settings.sheets ?? [], cachedState: [...sheetsState.value] }`.
- When `sourceId === null`: `{ sheets: [], cachedState: [] }`.

### Normalized Type

**`PlDataTableSheetNormalized`** (`types.ts`)

```
{
  axisId: AxisId          // extracted from axis via getAxisId()
  prefix: string          // display prefix for dropdown (from pl7.app/label annotation)
  options: ListOptionBase<string | number>[]
  defaultValue: string | number   // resolved, always valid
}
```

### State Type

**`PlDataTableSheetState`** (`@platforma-sdk/model`, `typesV5.ts`)

```
{
  axisId: AxisId           // identity of the partitioned axis
  value: string | number   // currently selected partition value
}
```

### Supporting Types

| Type                   | Location                              | Definition                                                               |
| ---------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `AxisSpec`             | `lib/model/common`, `spec.ts`         | `{ type, name, domain?, contextDomain?, annotations?, parentAxesSpec? }` |
| `AxisId`               | `lib/model/common`, `spec.ts`         | `{ type: AxisValueType, name: string, domain?, contextDomain? }`         |
| `ListOptionBase<T>`    | `lib/model/common`, `common_types.ts` | `{ label: string, value: T, description?, group? }`                      |
| `PTableColumnId`       | `lib/model/common`, `table_common.ts` | `PTableColumnIdAxis \| PTableColumnIdColumn`                             |
| `PTableColumnIdAxis`   | `lib/model/common`, `table_common.ts` | `{ type: "axis", id: AxisId }`                                           |
| `CanonicalizedJson<T>` | `lib/model/common`, `json.ts`         | Branded `string` (deterministic JSON serialization via `canonicalize`)   |

---

## Normalization Pipeline

`PlAgDataTableSheets.vue` computes a `sheets` array from `props.settings` in a `computed`:

### Step 1: Filter Empty Sheets

```
settings.sheets.filter(sheet => sheet.options.length > 0)
```

Sheets with zero options are silently dropped. They produce no dropdown and no filter.

### Step 2: Extract Axis Identity

```
const axisId = getAxisId(sheet.axis)
```

`getAxisId()` extracts `{ type, name, domain?, contextDomain? }` from the full `AxisSpec`,
stripping `annotations`, `parentAxesSpec`, and other non-identity fields.

### Step 3: Resolve Default Value

Priority cascade (first match wins):

| Priority | Source           | Condition                                                                                           |
| -------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| 1        | Cached state     | `cachedState` entry with matching `axisId` (via `isJsonEqual`) AND value present in `sheet.options` |
| 2        | Metadata default | `sheet.defaultValue` is defined AND present in `sheet.options`                                      |
| 3        | First option     | `sheet.options[0].value` (unconditional fallback)                                                   |

Validation check (`isValidOption`): `sheet.options.some(option => option.value === value)`.
Uses strict equality (`===`), so type matters (`"1"` does not match `1`).

### Step 4: Build Display Prefix

```
sheet.axis.annotations?.["pl7.app/label"]?.trim() ?? `Unlabeled axis ${i}`
```

Result is suffixed with `":"`. Example: `"Sample:"`, `"Condition:"`.
Index `i` is the position in the post-filter array (not the original `sheets` array).

### Output

Array of `PlDataTableSheetNormalized` objects, one per non-empty sheet.

---

## State Management

### Initialization (`watchEffect`)

On every change to the normalized `sheets` computed:

1. Builds `newState` by mapping each sheet to `{ axisId, value: sheet.defaultValue }`.
2. Compares with current `state.value` via `isJsonEqual`.
3. Replaces `state.value` only if different.

This runs on mount and whenever settings change (e.g., new `sourceId`).

### User Interaction (`onSheetChanged`)

When a user selects a new dropdown value for sheet at index `i`:

1. Creates `stateEntry = { axisId: sheets[i].axisId, value: newValue }`.
2. Compares with `state.value[i]` via `isJsonEqual`.
3. If different, produces a new array with the entry replaced at index `i`.

### State Binding

`state` is a `defineModel<PlDataTableSheetState[]>()` with default `[]`.
In `PlAgDataTableV2.vue`, this is bound as `v-model="sheetsState"`, which connects to
the `sheetsState` `WritableComputedRef` from `useTableState()`.

Write path: `sheetsState` setter -> `tableState` setter -> `createPTableParams()` ->
`tableStateNormalized` setter (debounced 300ms) -> persisted state.

---

## Filter Spec Conversion

### `convertPartitionFiltersToFilterSpec(sheetsState)`

Location: `sources/table-state-v2.ts`, lines 186-195.

For each `PlDataTableSheetState` entry, produces one `FilterSpec` leaf:

| Value Type | Filter Spec     | Fields                                              |
| ---------- | --------------- | --------------------------------------------------- |
| `string`   | `patternEquals` | `{ type: "patternEquals", column, value: s.value }` |
| `number`   | `equal`         | `{ type: "equal", column, x: s.value }`             |

The `column` field is `canonicalizeJson<PTableColumnId>({ type: "axis", id: s.axisId })` --
a deterministic JSON string encoding a `PTableColumnIdAxis`.

Type dispatch: `typeof s.value === "number"`.

### Merge into PTableParamsV2

In `createPTableParams()` (same file), partition filters are merged with other filter sources:

```
const parts = [
  ...convertPartitionFiltersToFilterSpec(state.sheetsState),   // partition filters (0..N)
  ...(state.filtersState ? [state.filtersState] : []),         // column filters (0..1)
  ...(searchNode ? [searchNode] : []),                         // search filter (0..1)
]
```

Combination logic:

| parts.length | Result                            |
| ------------ | --------------------------------- |
| 0            | `null`                            |
| 1            | `parts[0]` (passed directly)      |
| 2+           | `{ type: "and", filters: parts }` |

The combined spec is then passed through `distillFilterSpec()`, which recursively strips
empty/undefined leaves and collapses single-child groups.

Final result is assigned to `PTableParamsV2.filters`.

---

## UI Rendering

### Component: `PlAgDataTableSheets.vue`

Template structure:

```
<div .container>                          -- flex row, gap 12px, wraps, z-index 3
  <slot name="before" />                  -- injected by parent (before-sheets slot)
  <PlDropdownLine                         -- one per normalized sheet
    v-if="state[i]"                       -- guard: state may lag behind sheets on initial render
    :model-value="state[i].value"
    :options="sheet.options"
    :prefix="sheet.prefix"
    @update:model-value="onSheetChanged(i, newValue)"
  />
  <slot name="after" />                   -- injected by parent (after-sheets slot)
</div>
```

The container is rendered only when at least one of the following is true:

- `$slots['before']` is provided
- `sheets.length > 0`
- `$slots['after']` is provided

### Slot Forwarding in PlAgDataTableV2.vue

| Parent slot name | Maps to PlAgDataTableSheets slot |
| ---------------- | -------------------------------- |
| `before-sheets`  | `before`                         |
| `after-sheets`   | `after`                          |

---

## End-to-End Data Flow

```
PlDataTableSheet[] (from block/settings)
  |
  v
PlAgDataTableV2.vue: builds PlDataTableSheetsSettings
  { sheets: settings.sheets, cachedState: sheetsState.value }
  |
  v
PlAgDataTableSheets.vue: normalize
  1. filter: drop sheets with 0 options
  2. for each sheet:
     a. axisId = getAxisId(sheet.axis)
     b. defaultValue = cachedState match || sheet.defaultValue || options[0].value
     c. prefix = annotation "pl7.app/label" + ":" || "Unlabeled axis N:"
  -> PlDataTableSheetNormalized[]
  |
  v
PlAgDataTableSheets.vue: render PlDropdownLine per sheet
  |
  v (user selects value)
PlAgDataTableSheets.vue: updates state (v-model)
  -> PlDataTableSheetState[] = [{ axisId, value }, ...]
  |
  v
useTableState().sheetsState setter
  -> spreads into PlDataTableStateV2CacheEntry
  -> triggers createPTableParams()
  |
  v
convertPartitionFiltersToFilterSpec(sheetsState)
  -> per entry: string -> patternEquals, number -> equal
  -> column = canonicalizeJson({ type: "axis", id: axisId })
  |
  v
createPTableParams(): merge
  [partitionFilters..., columnFilters?, searchFilter?]
  -> AND-combine if 2+, passthrough if 1, null if 0
  -> distillFilterSpec()
  |
  v
PTableParamsV2.filters
  -> consumed by calculateGridOptions() -> server-side data source
```

---

## Edge Cases

| Case                                             | Behavior                                                                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sheet with 0 options                             | Dropped during normalization. No dropdown rendered, no filter produced.                                                                  |
| Cached value not in current options              | Falls through to `defaultValue` or `options[0]`.                                                                                         |
| `defaultValue` not in current options            | Falls through to `options[0]`.                                                                                                           |
| No sheets at all                                 | `sheetsState` is `[]`. `convertPartitionFiltersToFilterSpec` returns `[]`. No partition filters in params.                               |
| `sourceId` is `null`                             | `sheetsSettings` is `{ sheets: [], cachedState: [] }`. No sheets rendered.                                                               |
| State array shorter than sheets array            | `v-if="state[i]"` guard prevents render error. `watchEffect` will synchronize on next tick.                                              |
| Value type mismatch (string `"1"` vs number `1`) | `isValidOption` uses `===`. Mismatch causes fallthrough to next default priority. Filter type depends on `typeof` of the resolved value. |
