# Plan: Refactor filter chain — distill instead of flatten, wire up createPTableV2

## Context

Currently the tree-based `PlDataTableAdvancedFilter` (with grouping/nesting: AND/OR/NOT) gets **flattened** into `PTableRecordFilter[]` (per-column predicates) in `table-state-v2.ts::makeFilters()`. This loses the grouping structure. The flat result goes to `createPTable` (V1) in the driver.

We want to:
1. **Stop flattening** — just strip UI metadata (`id`, `isExpanded`) from the filter tree
2. **Replace** old flat `filters: PTableRecordFilter[]` with `filters: FilterSpec` in `PTableDef` and `PTableParamsV2`
3. **Remove** the old `makeFilters()` converter entirely
4. **Wire up `createPTableV2`** to accept the new format (plumbing only, full impl later)
5. **Move the filterModel bridge** from `PlTableFiltersV2.vue` to the data layer

## Steps

### Step 1: Move `FilterSpec` types to `lib/model/common`

**From:** `sdk/model/src/filters/types.ts` (lines 11-58)
**To:** `lib/model/common/src/drivers/pframe/filter_spec.ts` (**NEW**)

Move these types (they already only depend on `SUniversalPColumnId` from the same package):
- `FilterSpecNode`
- `FilterSpecLeaf`
- `FilterSpec`
- `FilterSpecType`
- `FilterSpecOfType`

Leave `SimplifiedPColumnSpec` and `SimplifiedUniversalPColumnEntry` in `sdk/model/src/filters/types.ts`.

**Update:** `lib/model/common/src/drivers/pframe/index.ts` — add `export * from "./filter_spec"`.

**Update:** `sdk/model/src/filters/types.ts` — re-export from `@milaboratories/pl-model-common` instead of defining locally. Keeps backward compat for all existing importers.

### Step 2: Replace `filters` type in `PTableDef` with `FilterSpec`

**File:** `lib/model/common/src/drivers/pframe/table_calculate.ts`

Replace the old flat filter type with `FilterSpec`:
```typescript
export interface PTableDef<Col> {
  readonly src: JoinEntry<Col>;
  readonly partitionFilters: PTableRecordFilter[];
  readonly filters: FilterSpec<FilterSpecLeaf<string>> | null;  // WAS: PTableRecordFilter[]
  readonly sorting: PTableSorting[];
};
```

Import from local `./filter_spec`. `mapPTableDef` uses `{ ...def, src: ... }` spread — no changes needed there.

This will break all places that produce/consume `PTableDef.filters` — we fix them downstream.

### Step 3: Create `distillFilter()` function

**New file:** `sdk/model/src/filters/distill.ts`

Recursive function that strips `{ id, isExpanded }` from every node:
- Input: `FilterSpec<FilterSpecLeaf<string>, { id: number; isExpanded?: boolean }> | null`
- Output: `FilterSpec<FilterSpecLeaf<string>> | null` (clean tree)

Handles: leaf nodes (strip id/isExpanded), `not` nodes (strip + recurse into `filter`), `and`/`or` nodes (strip + recurse into `filters[]`).

**Update:** `sdk/model/src/filters/index.ts` — export `distillFilter`.

### Step 4: Replace `filters` type in `PTableParamsV2` with `FilterSpec`

**File:** `sdk/model/src/components/PlDataTable.ts`

Replace `filters` in both branches of `PTableParamsV2` (lines 193-207):
```typescript
// was: filters: PTableRecordFilter[];
filters: FilterSpec<FilterSpecLeaf<string>> | null;
```

Update `makeDefaultPTableParams()` — set `filters: null`.

### Step 5: Remove `makeFilters()` converter and replace with `distillFilter()`

**File:** `sdk/ui-vue/src/components/PlAgDataTable/sources/table-state-v2.ts`

**Remove entirely** (lines 75-262):
- `AdvancedFilterNode` type alias
- `ColumnPredicatePair` type
- `makeFilterColumnId()` function
- `parseFilterColumnId()` function
- `isAlphabeticColumn()` function
- `leafToPredicate()` function
- `isLeafNode()` function
- `processFilterNode()` function
- `makeFilters()` function

**In `makePTableParams()`** (line 279) — replace:
```typescript
// was: filters: makeFilters(state.filtersState, columns),
filters: distillFilter(state.filtersState),
```

Import `distillFilter` from `@platforma-sdk/model`.

The `columns` parameter is no longer needed for filters (it was used for alphabetic detection in the old converter). It may still be needed for other uses — check.

### Step 6: Move filterModel bridge to data layer

**File:** `sdk/ui-vue/src/components/PlAgDataTable/sources/table-state-v2.ts`

In the `filtersState` computed getter (inside `useTableState`), add the null-to-default logic that currently lives in `PlTableFiltersV2.vue` (lines 125-131):
```typescript
get: () => {
  const raw = tableState.value.filtersState;
  if (raw && (raw.type === "and" || raw.type === "or") && "filters" in raw && Array.isArray(raw.filters)) {
    return raw;
  }
  return { id: randomInt(), type: "and" as const, isExpanded: true, filters: [] };
},
```

**File:** `sdk/ui-vue/src/components/PlTableFilters/PlTableFiltersV2.vue`

Remove the `filterModel` computed (lines 123-135). Bind `model` directly to `PlAdvancedFilter`:
```vue
<PlAdvancedFilter v-model:filters="model" ... />
```

Also fix the `addFilterGroup` function to use immutable update (not `.push()`).

### Step 7: Update `createPTableDef()` and `createPlDataTableV2()` in PlDataTable.ts

**File:** `sdk/model/src/components/PlDataTable.ts`

Update `createPTableDef()` (line 592):
- Change `filters` param type from `PTableRecordSingleValueFilterV2[]` to `FilterSpec<FilterSpecLeaf<string>> | null`
- Pass through to the returned `PTableDef`

Update `createPlDataTableV2()` (line 656):
- Instead of reading `pTableParams.filters` as `PTableRecordSingleValueFilterV2[]`, pass the `FilterSpec` directly
- Remove the `uniqueBy`/`isValidColumnId` filter validation on flat filters (lines 709-717) — this doesn't apply to tree filters
- Keep calling `ctx.createPTable(fullDef)` (V1) for now — switch to `ctx.createPTableV2(fullDef)` when driver is implemented

### Step 8: Fix all `PTableDef.filters` consumers

Since `PTableDef.filters` changed type, fix all places that read/write it:

**`lib/node/pf-driver/src/driver_impl.ts`:**
- `createPTable()` (line 177) — needs to handle the new `FilterSpec | null` type. For V1 path, either convert FilterSpec to flat format here, or keep passing the data through to the existing wasm layer.
- `createPTableV2()` (line 209) — accepts the new type naturally. Still throws "not implemented".
- `migratePTableFilters()` — may need adjustment since it expects flat filters
- `sortPTableDef()` — sorts filters; needs adjustment for tree format

**`sdk/model/src/render/api.ts`:**
- `RenderCtxBase.createPTable()` (line 660) — `patchPTableDef()` touches filters; update for new type
- `RenderCtxBase.createPTableV2()` (line 681) — should work as-is since it just passes through

**`lib/node/pl-middle-layer/src/js_render/computable_context.ts`:**
- Passes PTableDef through — should work via `mapPTableDef` spread

**`lib/model/common/src/drivers/pframe/table_calculate.ts`:**
- `sortPTableDef()` — currently sorts `filters` array; adjust for tree type

### Step 9: Driver V1 backward compat bridge

Since `createPTable` (V1) in the driver needs flat `PTableRecordFilter[]` for the existing wasm layer, but `PTableDef.filters` is now `FilterSpec | null`:

Option: In `driver_impl.ts::createPTable()`, convert `FilterSpec` back to flat `PTableRecordFilter[]` for the V1 wasm path. This is a temporary bridge until V2 is implemented and V1 is removed. Move the old `leafToPredicate`/`processFilterNode` conversion logic here (from `table-state-v2.ts`).

Alternatively, if V1 createPTable is going away soon, we can make it ignore the new filter tree and pass empty filters (with a TODO comment).

## Files to modify (ordered)

| # | File | Change |
|---|------|--------|
| 1 | `lib/model/common/src/drivers/pframe/filter_spec.ts` | **NEW** — FilterSpec types moved from sdk |
| 2 | `lib/model/common/src/drivers/pframe/index.ts` | Export `./filter_spec` |
| 3 | `lib/model/common/src/drivers/pframe/table_calculate.ts` | Replace `filters` type in `PTableDef` with `FilterSpec`; update `sortPTableDef()` |
| 4 | `sdk/model/src/filters/types.ts` | Re-export types from `@milaboratories/pl-model-common` |
| 5 | `sdk/model/src/filters/distill.ts` | **NEW** — `distillFilter()` function |
| 6 | `sdk/model/src/filters/index.ts` | Export `distillFilter` |
| 7 | `sdk/model/src/components/PlDataTable.ts` | Replace `filters` in `PTableParamsV2`; update `createPTableDef()`; update `createPlDataTableV2()` |
| 8 | `sdk/model/src/render/api.ts` | Update `patchPTableDef()` for new filter type |
| 9 | `sdk/ui-vue/src/components/PlAgDataTable/sources/table-state-v2.ts` | Remove `makeFilters()` + helpers; use `distillFilter()`; move filterModel bridge |
| 10 | `sdk/ui-vue/src/components/PlTableFilters/PlTableFiltersV2.vue` | Remove `filterModel` bridge; bind directly; fix `addFilterGroup` |
| 11 | `lib/node/pf-driver/src/driver_impl.ts` | Handle new filter type in `createPTable` (V1 bridge); `createPTableV2` accepts naturally |

## Verification

1. TypeScript build: `npx turbo build` — ensure no type errors across all packages
2. Existing V1 path unchanged functionally — `createPTable` still works (with bridge conversion if needed)
3. `FilterSpec` is populated in `PTableParamsV2.filters` when advanced filters are set
4. `PlTableFiltersV2.vue` still works (filters UI opens, add/remove filters, persisted state)
5. All existing imports of `FilterSpec` from `@platforma-sdk/model` still resolve
