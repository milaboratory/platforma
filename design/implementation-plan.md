# Implementation Plan: Column Discovery API (R1–R21)

## File Structure

New directory: `sdk/model/src/columns/`

New files:
- `sdk/model/src/columns/column_snapshot.ts` — `ColumnSnapshot`, `ColumnData`, `ColumnSource` types
- `sdk/model/src/columns/column_collection_builder.ts` — `ColumnCollectionBuilder`, `ColumnCollection`, `AnchoredColumnCollection`
- `sdk/model/src/columns/column_provider.ts` — new `ColumnProvider` interface, `ProviderColumn`, `ArrayColumnProvider`, output adapter
- `sdk/model/src/columns/expand_by_partition.ts` — `expandByPartition` utility
- `sdk/model/src/columns/label.ts` — `deriveLabels` overload for `ColumnSnapshot[]`, `writeLabelsToSpecs`
- `sdk/model/src/columns/table.ts` — `createPlDataTableV3`
- `sdk/model/src/columns/graphs.ts` — `createPFrameForGraphsV2`
- `sdk/model/src/columns/index.ts` — barrel exports for the module

Modified files:
- `sdk/model/src/render/api.ts` — ResultPool implements new `ColumnProvider`, deprecation annotations
- `sdk/model/src/render/accessor.ts` — add `toColumnSource()` to `TreeNodeAccessor`
- `sdk/model/src/render/util/column_collection.ts` — deprecation annotations on `PColumnCollection`, `AxisLabelProvider`
- `sdk/model/src/index.ts` — re-export `sdk/model/src/columns`

---

## Steps

### Step 1: Core Types — `ColumnSnapshot`, `ColumnData`, `ColumnSource`

**File:** `sdk/model/src/columns/column_snapshot.ts`

**R9, R10, R11, R12** — Define the snapshot and data accessor types.

```typescript
interface ColumnSnapshot<Id extends PObjectId = PObjectId> {
  readonly id: Id;
  readonly spec: PColumnSpec;
  readonly dataStatus: 'ready' | 'computing' | 'absent';
  readonly data: ColumnData | undefined;
}

interface ColumnData {
  get(): PColumnDataUniversal | undefined;
}

type ColumnSource = ColumnProvider | ColumnSnapshot[] | PColumn<PColumnDataUniversal | undefined>[];
```

Implementation notes:
- `ColumnData` is a simple class wrapping a provider's `getData()` + optional `markUnstable` callback from the render context
- When `dataStatus === 'computing'`, `get()` calls `markUnstable()` then returns `undefined`
- When `dataStatus === 'ready'`, `get()` returns the provider's data directly (no `markUnstable`)
- When `dataStatus === 'absent'`, the `data` field on `ColumnSnapshot` is `undefined` — no `ColumnData` instance created
- `dataStatus` is a plain readonly field — reading it has no side effects

Key decision: `ColumnData` as a plain class (not Proxy) — simplest approach, matches the spec contract. Alexander can refine during implementation.

**Tests:** Unit tests for `ColumnData.get()` behavior in each status; verify `markUnstable` is called only for `'computing'`.

---

### Step 2: New `ColumnProvider` Interface

**File:** `sdk/model/src/columns/column_provider.ts`

**R15** — Extended provider interface with `getColumn` and `isColumnListComplete`.

```typescript
interface ColumnProvider {
  selectColumns(
    selectors: ((spec: PColumnSpec) => boolean) | ColumnSelector | ColumnSelector[],
  ): ProviderColumn[];

  getColumn(id: PObjectId): ProviderColumn | undefined;

  isColumnListComplete(): boolean;
}

interface ProviderColumn {
  readonly id: PObjectId;
  readonly spec: PColumnSpec;
  readonly dataStatus: 'ready' | 'computing' | 'absent';
  getData(): PColumnDataUniversal | undefined;
}
```

**R15** — Also implement `ArrayColumnProvider` here (simple: always complete, data always ready).

Implementation notes:
- The old `ColumnProvider` from `column_collection.ts` returned `PColumn<PColumnDataUniversal | undefined>[]`. The new one returns `ProviderColumn[]` — different type. Need to distinguish them. The old interface stays in its file with deprecation; the new interface lives in the new file.
- Consider naming: `ColumnProviderV2` during transition, or use different import paths. Best approach: the new types live in a new file with distinct names; old code continues using old interface.

---

### Step 3: ResultPool Implements New `ColumnProvider`

**File:** `sdk/model/src/render/api.ts`

**R16** — Extend ResultPool to implement the new `ColumnProvider` interface.

What to implement:
1. `getColumn(id: PObjectId)` — lookup by canonicalized `PlRef`. Delegates to existing `getSpecFromResultPoolByRef` + status detection.
2. `isColumnListComplete()` — returns `true` when all field lists are final/locked. Uses existing `getInputsLocked()` / `getIsFinal()` on the result pool accessor.
3. `selectColumns()` returning `ProviderColumn[]` — wrap existing logic, add `dataStatus` detection per column:
   - No data resource + field locked → `'absent'`
   - `getIsReadyOrError() === true` → `'ready'`
   - `getIsReadyOrError() === false` → `'computing'`
4. `getData()` on each `ProviderColumn` — delegates to the existing lazy data getter on TreeNodeAccessor (the current `data` property getter).

Implementation notes:
- ResultPool already has `selectColumns()` returning `PColumn<PColumnDataUniversal | undefined>[]`. The new method returns `ProviderColumn[]`. Options: (a) add a separate method name, (b) implement the new interface alongside old one using adapter. Best approach: ResultPool implements both interfaces — old `selectColumns` stays for backward compat, new interface methods added alongside.
- `dataStatus` detection: use `TreeNodeAccessor.getIsReadyOrError()` (already available, see existing `allPColumnsReady` in `pcolumn_data.ts`) and field finality.

---

### Step 4: Output/Prerun Provider Adapter

**File:** `sdk/model/src/columns/column_provider.ts` (same file as Step 2)

**R17** — Adapter to create `ColumnProvider` from `ctx.outputs.resolve(...)` / `ctx.prerun.resolve(...)`.

```typescript
function createOutputColumnProvider(
  accessor: TreeNodeAccessor,
  opts?: { allowPermanentAbsence?: boolean }
): ColumnProvider;
```

Implementation notes:
- Internally calls `accessor.getPColumns()` to enumerate columns
- `isColumnListComplete()` — checks field resolution finality on the accessor
- `dataStatus`:
  - `allowPermanentAbsence + getIsFinal()` → `'absent'`
  - `getIsReadyOrError() === true` → `'ready'`
  - else → `'computing'`
- `getColumn(id)` — linear scan over `getPColumns()` result, match by canonicalized ID

---

### Step 5: `TreeNodeAccessor.toColumnSource()`

**File:** `sdk/model/src/render/accessor.ts`

**R4** — Add method to TreeNodeAccessor.

```typescript
toColumnSource(): ColumnSource {
  return createOutputColumnProvider(this);
}
```

Implementation note: This creates an output adapter (from Step 4) and returns it as `ColumnSource`. The return type is `ColumnProvider` which is a subtype of `ColumnSource`.

---

### Step 6: `ColumnCollectionBuilder` + `ColumnCollection`

**File:** `sdk/model/src/columns/column_collection_builder.ts`

**R1, R2, R3, R5, R6, R8** — The builder and plain collection.

#### `ColumnCollectionBuilder`

```typescript
class ColumnCollectionBuilder {
  private sources: InternalSource[] = [];

  addSource(source: ColumnSource | TreeNodeAccessor): this {
    // TreeNodeAccessor → call getPColumns() internally, wrap in ArrayColumnProvider
    // ColumnSnapshot[] → wrap in adapter
    // PColumn[] → wrap in ArrayColumnProvider
    // ColumnProvider → store directly
    return this;
  }

  build(): ColumnCollection | undefined;
  build(opts: { allowPartialColumnList: true }): ColumnCollection & { columnListComplete: boolean };
  build(opts: { anchors: Record<string, PObjectId | PlRef | PColumnSpec> }): AnchoredColumnCollection | undefined;
  build(opts: { anchors: ...; allowPartialColumnList: true }): AnchoredColumnCollection & { columnListComplete: boolean };
}
```

Implementation flow for `build()` (no anchors):
1. Check `isColumnListComplete()` on each provider source
2. If any incomplete and `!allowPartialColumnList` → return `undefined`
3. Collect all columns from all providers (dedup by `PObjectId`, first source wins)
4. Construct `ColumnCollection` with the deduped column map
5. If `allowPartialColumnList` → set `columnListComplete` flag

#### `ColumnCollection`

```typescript
class ColumnCollectionImpl implements ColumnCollection {
  constructor(
    private columns: Map<PObjectId, { provider: ColumnProvider; providerColumn: ProviderColumn }>,
    private markUnstable: (() => void) | undefined,
  ) {}

  getColumn(id: PObjectId): ColumnSnapshot<PObjectId> | undefined {
    // Lookup in map, wrap in ColumnSnapshot with active object
  }

  findColumns(opts?: FindColumnsOpts): ColumnSnapshot<PObjectId>[] {
    // Apply include/exclude selectors via selectorsToPredicate
    // Filter the columns map
    // Wrap each in ColumnSnapshot
  }
}
```

Key detail: `ColumnSnapshot` construction wraps the `ProviderColumn.getData()` in a `ColumnData` active object that calls `markUnstable()` when status is `'computing'`. The `markUnstable` callback comes from the render context (passed through builder or captured from the computable framework context).

**Tests:**
- Builder with multiple sources, dedup by first-wins
- `build()` returns `undefined` when source incomplete
- `build({ allowPartialColumnList: true })` always returns collection
- `findColumns` with include/exclude selectors
- `getColumn` point lookup

---

### Step 7: `AnchoredColumnCollection`

**File:** `sdk/model/src/columns/column_collection_builder.ts` (same file)

**R6a, R6b, R6c** — Anchored collection with axis-aware discovery.

Implementation flow for `build({ anchors })`:
1. Resolve each anchor: `PObjectId`/`PlRef` → look up spec via `getColumn()` on providers; `PColumnSpec` → use directly
2. Derive trunk axes = union of unique axes from all anchor specs
3. Create `AnchoredIdDeriver` from anchor specs (existing utility from `pl-model-common`)
4. Check `isColumnListComplete()` on all providers
5. Return `AnchoredColumnCollection` or `undefined`

`AnchoredColumnCollection.findColumns()`:
1. Translate `include`/`exclude` to `ColumnSelector`
2. Translate `mode` to `MatchingConstraints` (see mapping in spec)
3. Call `pSpecDriver.discoverColumns` (Phase 3 WASM) — **Note: stub this for M1, wire real WASM in M2**
4. Map `DiscoverColumnsHit[]` → `ColumnMatch[]`:
   - Derive `SUniversalPColumnId` via `AnchoredIdDeriver`
   - Detect `dataStatus` from provider
   - Construct `ColumnSnapshot<SUniversalPColumnId>` with active object
   - Preserve `MatchVariant[]` from discovery

For M1 (before Phase 3 WASM): implement `findColumns` using existing `resolveAnchors` + `selectorsToPredicate` logic from current `PColumnCollection.getUniversalEntries()`. This produces correct results without linker traversal. M2 replaces with `discoverColumns` call.

**Tests:**
- Anchor resolution from `PObjectId`, `PlRef`, `PColumnSpec`
- `findColumns` returns `ColumnMatch[]` with correct `SUniversalPColumnId`
- `getColumn` by anchored ID
- `MatchingMode` mapping to constraints

---

### Step 8: Label Derivation Adaptation

**File:** `sdk/model/src/columns/label.ts`

**R13, R14** — Convenience wrappers over existing `deriveLabels` from `render/util/label.ts`, plus deprecated `writeLabelsToSpecs`.

The existing `deriveLabels` is already generic (`<T>` with `specExtractor`). This file provides a snapshot-aware wrapper:

```typescript
import { deriveLabels as deriveLabelsFull } from "../render/util/label";

/** Derive labels for column snapshots. Delegates to the existing algorithm. */
function deriveLabels(
  snapshots: ColumnSnapshot[],
  opts?: LabelDerivationOps,
): { snapshot: ColumnSnapshot; label: string }[] {
  return deriveLabelsFull(snapshots, (s) => s.spec, opts)
    .map(({ value, label }) => ({ snapshot: value, label }));
}

/** @deprecated Backward compatibility only. New code should use deriveLabels directly. */
function writeLabelsToSpecs(labeled: { snapshot: ColumnSnapshot; label: string }[]): void {
  for (const { snapshot, label } of labeled) {
    snapshot.spec.annotations['pl7.app/label'] = label;
    snapshot.spec.annotations['pl7.app/label/isDerived'] = 'true';
  }
}
```

The existing `render/util/label.ts` stays unchanged — `columns/label.ts` is a thin adapter on top of it.

---

### Step 9: `expandByPartition` Utility

**File:** `sdk/model/src/columns/expand_by_partition.ts`

**R21** — Separate splitting utility.

```typescript
function expandByPartition(
  snapshots: ColumnSnapshot[],
  splitAxes: { idx: number }[],
  opts?: {
    axisLabels?: (axisId: AxisId) => Record<string | number, string> | undefined;
  },
): { snapshots: ColumnSnapshot[]; complete: boolean };
```

Implementation:
1. For each snapshot, load partition data via `data.get()` + `getUniquePartitionKeys()`
2. If any data not ready → `{ snapshots: [], complete: false }`
3. Generate key combinations from partition keys on split axes
4. For each combination:
   - Clone spec with split axes removed from `axesSpec`
   - Add `pl7.app/trace` annotation: `{ type: "split:<axisId>", label: "<value label>", importance: 1_000_000 }`
   - Create new `ColumnSnapshot` with filtered data
5. Return expanded snapshots

This reuses logic from existing `PColumnCollection.getUniversalEntries()` (lines ~340-450 in `column_collection.ts`), extracted into a standalone function.

**Tests:**
- Single axis split produces K snapshots
- Multi-axis split produces K₁ × K₂ snapshots
- Trace annotations added correctly
- `complete: false` when data not ready
- Axis label resolution (with and without `axisLabels` callback)

---

### Step 10: `createPlDataTableV3`

**File:** `sdk/model/src/columns/table.ts`

**R19** — New table helper accepting `ColumnSource | ColumnSource[]`.

```typescript
function createPlDataTableV3<A, U>(
  ctx: RenderCtxBase<A, U>,
  sources: ColumnSource | ColumnSource[],
  tableState: PlDataTableStateV2 | undefined,
  ops?: CreatePlDataTableV3Ops,
): PlDataTableModel | undefined;
```

Implementation flow:
1. Create `ColumnCollectionBuilder`, add all sources
2. `build({ anchors: ops.anchors })` or `build()` depending on whether anchors provided
3. `findColumns({ include: ops.include, exclude: ops.exclude, mode: ops.mode, maxLinkerHops: ops.maxLinkerHops })`
4. Find axis label columns via `findColumns({ include: { name: 'pl7.app/label' } })`
5. Match label columns to data column axes (`getMatchingLabelColumns` logic)
6. Call `deriveLabels()` on data columns
7. Apply `ColumnDisplayConfig` (ordering, visibility) — replaces annotation mutation
8. Construct `SpecQuery` join tree using `ColumnMatch.variants`
9. Create table via `ctx.createPTableV2()`

`ColumnDisplayConfig` application:
- `ordering`: sort columns by matching rules, higher priority = further left
- `visibility`: set `pl7.app/table/visibility` on internal spec copies based on rules

This function is structurally similar to `createPlDataTableV2` (existing ~150 lines), but uses the new collection API internally instead of `PColumnCollection`.

---

### Step 11: `createPFrameForGraphsV2`

**File:** `sdk/model/src/columns/graphs.ts`

**R20** — Same source-based pattern as table helper.

```typescript
function createPFrameForGraphsV2<A, U>(
  ctx: RenderCtxBase<A, U>,
  sources: ColumnSource | ColumnSource[],
  ops?: CreatePFrameForGraphsV2Ops,
): PFrameHandle | undefined;
```

Implementation: similar to table helper — build collection, discover columns, derive labels, create PFrame. Graph component may re-derive labels on visible subset internally.

---

### Step 12: Deprecation Annotations

**R22–R30** — Add `@deprecated` JSDoc to old API.

Files to annotate:
- `column_collection.ts`: `PColumnCollection` class, `AxisLabelProvider` interface
- `api.ts`: `getAnchoredPColumns()`, `getCanonicalOptions()` on ResultPool
- `column_collection.ts`: `getColumns()`, `getUniversalEntries()` on PColumnCollection
- `table.ts`: `createPlDataTableV2()`
- `PFrameForGraphs.ts`: `createPFrameForGraphs()`

**R31** — Explicitly NOT deprecated: `getOptions`, `selectColumns` (old), `getPColumnSpecByRef`, `getSpecs`, `deriveLabels`, `getUniquePartitionKeys`.

---

### Step 13: Exports

**File:** `sdk/model/src/columns/index.ts`

Barrel exports for the new module:
```typescript
export * from "./column_snapshot";
export * from "./column_provider";
export * from "./column_collection_builder";
export * from "./expand_by_partition";
export * from "./label";
export * from "./table";
export * from "./graphs";
```

**File:** `sdk/model/src/index.ts`

Add re-export:
```typescript
export * from "./columns";
```

---

## Execution Order

```
Step 1  ColumnSnapshot, ColumnData, ColumnSource types     (no deps)
Step 2  New ColumnProvider interface, ProviderColumn        (depends on Step 1)
Step 3  ResultPool implements new ColumnProvider             (depends on Step 2)
Step 4  Output/prerun provider adapter                      (depends on Step 2)
Step 5  TreeNodeAccessor.toColumnSource()                   (depends on Step 4)
Step 6  ColumnCollectionBuilder + ColumnCollection          (depends on Steps 1-4)
Step 7  AnchoredColumnCollection                            (depends on Step 6)
Step 8  deriveLabels adaptation + writeLabelsToSpecs        (depends on Step 1)
Step 9  expandByPartition                                   (depends on Step 1)
Step 10 createPlDataTableV3                                 (depends on Steps 6-8)
Step 11 createPFrameForGraphsV2                             (depends on Steps 6-8)
Step 12 Deprecation annotations                             (independent, do last)
Step 13 Exports                                             (after all steps)
```

Parallelizable:
- Steps 1–2 are sequential (type foundation)
- Steps 3, 4, 5 can proceed in parallel after Step 2
- Steps 8, 9 can proceed in parallel with Steps 6-7 (only depend on Step 1)
- Steps 10, 11 can proceed in parallel after Steps 6-8

---

## Risk Mitigation

1. **Old and new `ColumnProvider` coexist.** The old interface (in `render/util/column_collection.ts`) returns `PColumn[]`; the new one (in `columns/column_provider.ts`) returns `ProviderColumn[]`. They're separate types, separate directories — no collision. Old code continues using old interface via existing imports.

2. **`markUnstable` callback sourcing.** Need to determine how the builder gets the render context's `markUnstable` callback. Options: (a) pass explicitly to builder constructor, (b) capture from a thread-local/context variable in the computable framework. Explore during Step 6 implementation.

3. **Phase 3 WASM availability.** `AnchoredColumnCollection.findColumns` needs `pSpecDriver.discoverColumns`. For M1, use existing `resolveAnchors` + `selectorsToPredicate` as fallback. Wire WASM in M2 (March 12+).

4. **Backward compatibility.** Old `PColumnCollection` and `getAnchoredPColumns` continue working unchanged. New API is additive — no breaking changes.
