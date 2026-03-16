# Column Discovery API Redesign

**One-liner:** Unified column discovery that separates spec lookup from data loading

**Status:** Active

**Start:** 2026-03-04

**Target:** 2026-03-13

**Urgency:** 7 — blocks label/dropdown code on Lead Selection, blocks V3 migration quality

**Importance:** 8 — affects every block that queries the result pool; current API forces workarounds

**Size:** S~M

---

## Overview

**Problem:** The SDK's column discovery API (`getAnchoredPColumns`) combines three operations into one call: spec matching, label derivation, and data loading. Blocks that need only specs (for dropdowns, boolean checks) must wait for all column data to load. This creates five interconnected problems:

1. **Dropdowns blocked on data.** Filter/ranking dropdowns stay empty until all upstream column data loads — even though populating a dropdown requires only column specs.
2. **No per-column data status.** `getAnchoredPColumns` returns `PColumn[] | undefined`. One unready column makes the entire result `undefined`. Blocks can't show partial results or per-column computation states.
3. **No distinction between computing and permanently absent data.** A column whose data will never arrive (no data resource, field list locked) looks identical to a column whose data is still computing — both produce `undefined`. Blocks can't show "not available" vs. "computing."
4. **Unwanted instability.** Accessing column data marks the render context unstable. Spec-only outputs (dropdowns, boolean flags) inherit this instability, causing flickering or stale retained values.
5. **Label triple-override.** `getAnchoredPColumns` derives labels internally and writes them to `pl7.app/label` on each spec. Blocks re-derive on subsets and write back again. Lead Selection has ~190 lines of label hack code — four functions deriving labels on overlapping subsets, each overwriting `pl7.app/label` from the previous pass. The problem isn't derivation (a pure computation) — it's the repeated write-back across overlapping subsets.

**Value:** One API for column discovery that separates spec lookup from data access, with labels derived automatically by table/graph helpers. Block model code becomes shorter and correct by construction. Dropdowns appear instantly. Data status is inspectable per column without side effects.

**Business impact:** Lead Selection (the block triggering this) serves AstraZeneca ($95k), Takeda ($55k), Red Queen Bio ($20k), Sanavia Bio ($10.5k). The label/dropdown complexity directly blocks clean V3 migration and new feature development on this block. Every block querying columns benefits from the fix.

### Connections

- **Blocks:** All blocks using `getAnchoredPColumns`, `getOptions`, `getCanonicalOptions`. Immediate beneficiary: `antibody-tcr-lead-selection`.
- **Blocked by:** Nothing — this is an SDK improvement.
- **Related:** `in-vivo-lead-selection` (triggered the investigation), `unified-block-state-finalization` (related V3 migration work)

---

## Concept

The new API separates column discovery into two phases: **building** (registering sources) and **querying** (finding columns). `ColumnCollectionBuilder` accumulates sources via `addSource`, then `build()` produces one of two collection types depending on whether anchors are provided. Discovery returns **column snapshots** — objects carrying the spec, a data status flag, and a lazy data accessor. Each output lambda creates its own builder (a constraint of the computable framework — each output tracks its own dependencies). Five key design shifts:

**Two collection types.** `build()` without anchors returns a `ColumnCollection` — a simple collection whose `findColumns` does selector-based filtering and returns flat `ColumnSnapshot[]`. `build({ anchors })` returns an `AnchoredColumnCollection` — a collection with an axis namespace and trunk context. Its `findColumns` performs axis-aware discovery (via `pSpecDriver.discoverColumns` WASM) and returns `ColumnMatch[]` — results carrying the column snapshot plus qualification mappings and linker paths needed for query construction. The split reflects real block patterns: most blocks either do simple name/annotation filtering (plain collection) or axis-compatible discovery relative to an anchor (anchored collection). Anchors define both the ID namespace (`SUniversalPColumnId`) and the trunk axes for compatibility matching — in practice, blocks always search for columns sharing axes with their anchors.

**Building absorbs the "not ready" state.** `build()` returns a collection or `undefined`. If any source hasn't finished enumerating its column list, `build()` returns `undefined` (computable framework convention for "re-render later"). With `allowPartialColumnList: true`, `build()` always returns a collection (never `undefined`) even if some sources are still loading — it carries a `columnListComplete` flag. This eliminates the `allowIncomplete` overload from `findColumns` — once you have a collection, `findColumns` always returns results (never `undefined`).

**Spec discovery doesn't touch data.** `findColumns` matches columns by selectors, deduplicates — and returns snapshots with specs. Data is never loaded during this step. The render context stays stable. `findColumns` always returns results (never `undefined`) — the "not ready" state was absorbed by the builder.

**Data access is explicit and per-column.** Each snapshot exposes `dataStatus` (`'ready' | 'computing' | 'absent'`) readable without side effects. The `data` field holds an active object with a `get()` method — accessing it when `'computing'` marks the context unstable (the right default: a developer who doesn't check status and passes snapshots to a table helper is correctly marked unstable, since the output genuinely depends on unready data). When `'absent'`, the `data` field is `undefined` — no active object exists, no instability possible.

**Tables and graphs accept sources directly.** Block developers pass column sources (`ColumnSource | ColumnSource[]`) to table/graph helpers (`createPlDataTableV3`, `createPFrameForGraphsV2`). The helpers internally build a collection, discover columns, call `deriveLabels`, and handle all `pl7.app/label` annotation plumbing. `ColumnSource` is the type union of `ColumnProvider | ColumnSnapshot[]` — it does NOT include `TreeNodeAccessor`. To pass a `TreeNodeAccessor` (from `ctx.outputs.resolve()` or `ctx.prerun?.resolve()`), call `.toColumnSource()` on it first — this surfaces type conversion errors at the call site. `addSource` on the builder does accept `TreeNodeAccessor` directly for convenience. `deriveLabels` remains available as a standalone function for dropdowns, option lists, and custom displays. `expandByPartition` adds trace elements (`pl7.app/trace`), not labels — when the helper later calls `deriveLabels` internally, trace elements produce good split-aware labels.

Sources added first take precedence when deduplicating by native column ID — this preserves the pattern where prerun columns are added before resultPool to ensure prerun results win. `AxisLabelProvider` is eliminated — axis label lookup is a column query with a specific predicate, not a separate abstraction.

**Column splitting is a separate utility, not a discovery operation.** Splitting (partitioning a column along an axis into multiple entries) requires loading partition data — fundamentally incompatible with spec-only discovery. Only one block (`clonotype-browser`) uses it. A separate `expandByPartition()` function operates on already-discovered snapshots, loads data for those being split, and returns expanded snapshots with adjusted specs and trace annotations. `deriveLabels` then handles split entries naturally via trace — no split-specific label logic needed.

---

## Requirements

**ColumnCollectionBuilder**

- [ ] **R1.** `ColumnCollectionBuilder` — mutable builder that accumulates column sources. See Technical Specification for authoritative interface definition.
- [ ] **R2.** `addSource(source)` accepts: `ColumnSource` types (`ColumnProvider`, `ColumnSnapshot[]`, `PColumn[]`), and also `TreeNodeAccessor` directly (convenience — internally calls `getPColumns()`). Does NOT accept `undefined`. Sources added first take precedence for dedup by native column ID.
- [ ] **R3.** `build()` produces one of two collection types. Without anchors: returns `ColumnCollection | undefined` (plain selector filtering, `PObjectId` namespace). With `anchors`: returns `AnchoredColumnCollection | undefined` (axis-aware discovery, `SUniversalPColumnId` namespace). Returns `undefined` while any source's column list is still loading. With `allowPartialColumnList: true`, always returns a collection (never `undefined`) with `columnListComplete: boolean` flag. Anchors define both the ID namespace and the trunk axes (union of unique axes from all anchor columns).
- [ ] **R4.** `TreeNodeAccessor.toColumnSource()` — method on `TreeNodeAccessor` that converts it to a `ColumnSource`. Required when passing to helpers (which accept `ColumnSource | ColumnSource[]`); `addSource` accepts `TreeNodeAccessor` directly but the `ColumnSource` type does not include it.

**ColumnCollection (plain)**

- [ ] **R5.** `ColumnCollection` — immutable result of `build()` without anchors. Methods: `findColumns` returns `ColumnSnapshot<PObjectId>[]` (selector filtering, no axis matching); `getColumn(id: PObjectId)` returns a single snapshot by provider-native ID. Always returns results (never `undefined`). The "not ready" state was absorbed by the builder.
- [ ] **R6.** `findColumns` on plain collection takes optional `FindColumnsOpts` with `include` (positive selector) and `exclude` (negative selector). Uses `ColumnSelector` only — no lambdas, no anchored selector syntax. If `include` is omitted, includes all columns.

**AnchoredColumnCollection**

- [ ] **R6a.** `AnchoredColumnCollection` — immutable result of `build({ anchors })`. Methods: `findColumns` returns `ColumnMatch[]` (axis-aware discovery with routing info); `getColumn(id: SUniversalPColumnId)` returns a single snapshot by anchored ID.
- [ ] **R6b.** `findColumns` on anchored collection performs axis-compatible discovery via `pSpecDriver.discoverColumns` (Phase 3 WASM). Takes optional `AnchoredFindColumnsOpts` extending `FindColumnsOpts` with `mode?: MatchingMode` (default: `'enrichment'`) and `maxLinkerHops?: number`. Returns `ColumnMatch[]` — each match carries a `ColumnSnapshot<SUniversalPColumnId>`, the `originalId: PObjectId`, and `variants: MatchVariant[]` with qualification mappings and linker paths.
- [ ] **R6c.** Different paths and qualifications produce different data. All match variants are returned — the UI uses them for query construction and disambiguation. `MatchVariant` mirrors the Phase 3 `discoverColumns` response structure.

**Shared**

- [ ] **R7.** `findColumns` never loads column data and never performs axis splitting. Splitting is a separate utility (R21). Sheet/tab enumeration (`getUniquePartitionKeys`) is an orthogonal concern — unchanged.
- [ ] **R8.** `columnListComplete: boolean` — added via `&` intersection on both collection types when returned by `build({ allowPartialColumnList: true })`. Tells callers whether more columns may appear on re-render.

**ColumnSnapshot**

- [ ] **R9.** Each snapshot exposes: `id: Id` (generic — `PObjectId` on `ColumnCollection`, `SUniversalPColumnId` on `AnchoredColumnCollection` / inside `ColumnMatch`), `spec: PColumnSpec`, `dataStatus: 'ready' | 'computing' | 'absent'`.
- [ ] **R10.** `dataStatus` is readable without marking the render context unstable.
- [ ] **R11.** `data` field holds an active object (`ColumnData`) or `undefined`. When `'ready'`: `data.get()` returns column data, context stays stable. When `'computing'`: `data.get()` returns `undefined`, marks context unstable. When `'absent'`: `data` is `undefined` (no active object exists, no instability possible). `markUnstable: false` opt-in may exist on the active object for advanced use cases.
- [ ] **R12.** `'absent'` means: spec exists, data will never arrive. Detected by: no data resource exists and field list is locked/final. (Note: `hideDataFromUi` is a separate mechanism at the workflow export level, not a `dataStatus` detection factor at the SDK level.)

**Label derivation**

- [ ] **R13.** `deriveLabels(snapshots, opts?)` — pure computation, no side effects, repeatable. Uses the existing trace-based importance algorithm. Accepts `ColumnSnapshot[]` input. Callers use returned labels directly for display (dropdowns, option lists, custom displays). Not deprecated — part of the new API.
- [ ] **R14.** `writeLabelsToSpecs(labeled)` — born deprecated, backward compatibility only. Writes derived labels to `pl7.app/label` on each snapshot's spec and sets `pl7.app/label/isDerived: true`. New code never needs this — table and graph helpers derive labels internally.

**Column providers**

- [ ] **R15.** `ColumnProvider` interface: `selectColumns` returns `ProviderColumn[]`, `getColumn(id: PObjectId)` returns `ProviderColumn | undefined` (direct lookup for anchor resolution), `isColumnListComplete()` returns `boolean`. `selectColumns` returns currently known columns; `getColumn` looks up a single column by provider-native ID; `isColumnListComplete()` signals whether more columns may appear. Calling `isColumnListComplete()` may mark the render context unstable (it touches the reactive tree to check field resolution state). `dataStatus` detection is the provider's responsibility. `markUnstable` for data access is NOT part of the provider interface — it's a render-framework concern handled by `ColumnCollection` when constructing `ColumnSnapshot`.
- [ ] **R16.** Result pool implements `ColumnProvider`. `dataStatus` derived from `TreeNodeAccessor.getIsReadyOrError()` and `getIsFinal()`. `isColumnListComplete()` derived from field list finality.
- [ ] **R17.** Adapter to create a `ColumnProvider` from workflow outputs (`ctx.outputs.resolve(...)`) and prerun outputs (`ctx.prerun.resolve(...)`), with proper handling of `allowPermanentAbsence`, `getIsFinal`, and field resolution semantics.
- [ ] **R18.** `AxisLabelProvider` deprecated. Axis label lookup implemented as a column query (find label columns matching a given axis) within `ColumnCollection`.

**Table and graph helpers**

- [ ] **R19.** `createPlDataTableV3` — accepts `ColumnSource | ColumnSource[]`. Helper internally builds collection, discovers columns, derives labels. Includes `columnDisplay?: ColumnDisplayConfig` for declarative ordering and visibility rules (replaces annotation mutation). Includes `labelOpts?: LabelDerivationOps`.
- [ ] **R20.** `createPFrameForGraphsV2` — same source-based pattern. Graph component may re-derive labels on visible subset; this is internal to graphs.

**Axis splitting**

- [ ] **R21.** `expandByPartition(snapshots, splitAxes)` — separate utility, not part of `findColumns`. Takes `ColumnSnapshot[]` and axis indices to split on. Adds `pl7.app/trace` annotations (not labels) to expanded snapshot specs. When the table/graph helper later calls `deriveLabels` internally, trace elements produce good split-aware labels. `deriveLabels` handles split entries naturally via trace — no split-specific label logic needed.

**Deprecation**

- [ ] **R22.** `PColumnCollection` class deprecated → `ColumnCollectionBuilder` + `ColumnCollection` / `AnchoredColumnCollection`.
- [ ] **R23.** `getAnchoredPColumns` deprecated → `AnchoredColumnCollection.findColumns` + data access.
- [ ] **R24.** `getCanonicalOptions` deprecated → `AnchoredColumnCollection.findColumns` + `deriveLabels`.
- [ ] **R25.** `getColumns` on PColumnCollection deprecated → `findColumns` + data access.
- [ ] **R26.** `getUniversalEntries` on PColumnCollection deprecated → `findColumns`.
- [ ] **R27.** `createPlDataTableV2` deprecated → `createPlDataTableV3`.
- [ ] **R28.** `createPFrameForGraphs` deprecated → `createPFrameForGraphsV2`.
- [ ] **R29.** `AxisLabelProvider` deprecated → axis labels resolved through column queries.
- [ ] **R30.** `writeLabelsToSpecs` — born deprecated (backward compat only).
- [ ] **R31.** **NOT deprecated:** `getOptions` on ResultPool (returns `PlRef` — essential for block args and dependency tree, not replaced by new API), `selectColumns` on ResultPool (low-level escape hatch used by tcr-disco), `getPColumnSpecByRef`, `getSpecs`, `deriveLabels`, `getUniquePartitionKeys`.

---

## Scope

**In scope:**

- `ColumnCollectionBuilder` + `ColumnCollection` + `AnchoredColumnCollection` (builder/collection split with two collection types, replacing `PColumnCollection`)
- `ColumnSource` type and `TreeNodeAccessor.toColumnSource()` conversion
- `ColumnSnapshot` type with active object data access and `dataStatus`; `ColumnMatch` type with routing info (qualification mappings, linker steps); `MatchingMode` semantic enum (`'enrichment'` / `'related'` / `'exact'`) replacing raw `MatchingConstraints` for user-facing API
- Extended `ColumnProvider` interface with `getColumn(id)` and `isColumnListComplete()`
- Output/prerun column provider adapter
- `expandByPartition` utility — adds trace annotations, operates on snapshots after `findColumns`
- `createPlDataTableV3` and `createPFrameForGraphsV2` accepting `ColumnSource | ColumnSource[]` with `ColumnDisplayConfig`
- `writeLabelsToSpecs` — born deprecated, backward compat only
- Eliminating `AxisLabelProvider` as a separate concept
- Deprecation annotations on old methods (see R22–R31)

**Out of scope:**

- Removing deprecated methods (separate future cleanup)
- Migrating all existing blocks to new API (separate per-block work)
- Changes to the computable/render framework's stability tracking mechanism
- Changes to the Tengo workflow export system
- `getRelatedColumns` / `getAllRelatedColumns` — handled by pframes-api Phase 3 transition, not this spec. The `enrichCompatible` logic they contain becomes unnecessary when Phase 3's `discoverColumns` handles axis compatibility natively in WASM.

**Open questions:**

- [TODO] Ergonomics validation — after first draft, audit 5+ existing blocks to verify the new API simplifies real code. See `background.md` for block patterns to check.
- [TODO] Exact active object form — Alexander will explore during implementation (class, proxy, or other pattern). Spec states the contract; implementation details are his decision.
- [TODO] Axis-level display control — Lead Selection sets axis annotations too. Separate `axisDisplay` config or fold into existing options. Defer to implementation.

---

## Technical Specification

### Execution Model: Computable Framework

All APIs in this spec operate within the **computable framework** (render-based reactivity). There are no Promises. When data is unavailable, a function returns `undefined` — meaning "not ready yet, will re-render when ready." The framework re-invokes the render function when any dependency changes. This is how block model outputs and UI components work today.

`build()` returns a collection or `undefined` — `undefined` while column lists are still loading, a concrete collection once all sources report complete. Without anchors, returns `ColumnCollection`; with anchors, returns `AnchoredColumnCollection`. With `allowPartialColumnList: true`, `build()` always returns a collection (never `undefined`); its `columnListComplete` flag tells callers whether more columns may appear. On `ColumnCollection`, `findColumns` returns `ColumnSnapshot[]`. On `AnchoredColumnCollection`, `findColumns` returns `ColumnMatch[]` (snapshot + routing info). Neither ever returns `undefined`. `dataStatus` on each snapshot reflects the current state at render time; the framework automatically re-renders when the underlying data resource changes state.

Two patterns for using `dataStatus` in practice:

1. **Manual:** The model reads `dataStatus` and returns status information as an output. The UI renders progress indicators based on that output. The model re-renders when data status changes, producing updated output.
2. **Automatic:** The model accesses `data.get()` only for columns needed by the current view. Outputs that access still-computing data are automatically marked unstable by the computable framework — the UI shows the previous stable value until data arrives.

### ColumnSelector

`ColumnSelector` is defined in [spec/pframes/column-selector.md](../../spec/pframes/column-selector.md). All APIs in this spec use `ColumnSelector` for column matching. Both strict and relaxed forms are accepted; normalization happens internally.

### ColumnSource Type

```typescript
/** Union of types that can serve as column sources for helpers and builders */
type ColumnSource = ColumnProvider | ColumnSnapshot[] | PColumn<PColumnDataUniversal | undefined>[];
```

`ColumnSource` does NOT include `TreeNodeAccessor`. To convert a `TreeNodeAccessor` (from `ctx.outputs.resolve()` or `ctx.prerun?.resolve()`) to a `ColumnSource`, call `.toColumnSource()` on it. This surfaces type conversion errors at the call site rather than deep inside the builder or helper.

### ColumnCollectionBuilder, ColumnCollection, and AnchoredColumnCollection

Single authoritative interface definitions. All other sections reference these.

```typescript
class ColumnCollectionBuilder {
  /** Register a column source. Sources added first take precedence for dedup.
   *  Does NOT accept undefined — if a source isn't available yet,
   *  the caller should return undefined from the output lambda. */
  addSource(source: ColumnSource | TreeNodeAccessor): this;

  /** Plain collection — selector-based filtering, PObjectId namespace. */
  build(): ColumnCollection | undefined;
  build(opts: {
    allowPartialColumnList: true;
  }): ColumnCollection & { readonly columnListComplete: boolean };

  /** Anchored collection — axis-aware discovery, SUniversalPColumnId namespace.
   *  Anchors define both the ID namespace and the trunk axes for compatibility matching.
   *  Trunk = union of unique axes from all anchor columns. */
  build(opts: {
    anchors: Record<string, PObjectId | PlRef | PColumnSpec>;
  }): AnchoredColumnCollection | undefined;
  build(opts: {
    anchors: Record<string, PObjectId | PlRef | PColumnSpec>;
    allowPartialColumnList: true;
  }): AnchoredColumnCollection & { readonly columnListComplete: boolean };
}

/** Plain collection — no axis context, selector-based filtering only. */
interface ColumnCollection {
  /** Point lookup by provider-native ID. */
  getColumn(id: PObjectId): ColumnSnapshot<PObjectId> | undefined;

  /** Find columns matching selectors. Returns flat list of snapshots.
   *  No axis compatibility matching, no linker traversal. */
  findColumns(opts?: FindColumnsOpts): ColumnSnapshot<PObjectId>[];
}

/** Anchored collection — has trunk context (from anchors), axis-aware discovery.
 *  findColumns performs axis compatibility matching via pSpecDriver.discoverColumns
 *  (WASM) and returns ColumnMatch[] with qualification mappings and linker paths. */
interface AnchoredColumnCollection {
  /** Point lookup by anchored ID. */
  getColumn(id: SUniversalPColumnId): ColumnSnapshot<SUniversalPColumnId> | undefined;

  /** Axis-aware column discovery. Matches columns compatible with the trunk axes
   *  (derived from anchors), including through linker chains. Returns ColumnMatch[]
   *  with full routing info (qualifications, linker steps) for query construction.
   *  Different paths/qualifications produce different data — all variants are returned. */
  findColumns(opts?: AnchoredFindColumnsOpts): ColumnMatch[];
}

/** Options for plain collection findColumns. */
interface FindColumnsOpts {
  /** Include columns matching these selectors. If omitted, includes all columns. */
  include?: ColumnSelector | ColumnSelector[];
  /** Exclude columns matching these selectors. */
  exclude?: ColumnSelector | ColumnSelector[];
}

/** Controls axis matching behavior for anchored discovery.
 *  Maps to Phase 3 MatchingConstraints internally. */
type MatchingMode = "enrichment" | "related" | "exact";
// 'enrichment' (default) — "find columns whose data I can add to my current axes."
//   Every column axis must be satisfiable by trunk or linker one-side axes.
//   Maps to: { floatSrc: true, floatHit: false, qualSrc: true, qualHit: true }
// 'related' — "find columns sharing any axes with me."
//   Columns can have extra axes the trunk doesn't cover. For exploration.
//   Maps to: { floatSrc: true, floatHit: true, qualSrc: true, qualHit: true }
// 'exact' — "find columns with precisely matching axes, no domain reconciliation."
//   Maps to: { floatSrc: false, floatHit: false, qualSrc: false, qualHit: false }

/** Options for anchored collection findColumns. Extends plain opts with
 *  axis-matching controls. */
interface AnchoredFindColumnsOpts extends FindColumnsOpts {
  /** Controls axis matching behavior. Default: 'enrichment'. */
  mode?: MatchingMode;
  /** Maximum linker hops for cross-domain discovery (0 = direct only, default: 4). */
  maxLinkerHops?: number;
}
```

### ColumnMatch Type

Result of anchored discovery. Each `ColumnMatch` represents a column reachable from the trunk, carrying the full routing information needed for query construction.

```typescript
interface ColumnMatch {
  /** Column snapshot with anchored SUniversalPColumnId. */
  readonly column: ColumnSnapshot<SUniversalPColumnId>;
  /** Provider-native ID — for lookups back to the source provider. */
  readonly originalId: PObjectId;
  /** Match variants — different paths/qualifications that reach this column.
   *  Each variant produces potentially different data (different linker paths,
   *  different contextDomain qualifications). At least one variant is always present. */
  readonly variants: MatchVariant[];
}
```

`MatchVariant` mirrors the Phase 3 `discoverColumns` response — carries qualification mappings (source/hit/distinctive) and linker steps. See `work/projects/pframes-api/phase-3.md` for the full type definition. The UI uses variants to: (1) construct `SpecQuery` join trees with correct qualifications and `DropAxes` for linker-mediated joins, (2) disambiguate when the same column is reachable via multiple paths (using `distinctive` qualifications for labels).

**Source ordering:** Sources added first take precedence when deduplicating by native column ID. This preserves the pattern where prerun columns are added before resultPool to ensure prerun results win.

**Created per output lambda:** Builders are NOT shared across outputs. Each output lambda creates its own builder. This is a constraint of the computable framework — each output tracks its own dependencies.

**`addSource` accepts:**

- `ColumnProvider` — resultPool, adapters
- `ColumnSnapshot[]` — pre-discovered snapshots
- `PColumn<PColumnDataUniversal | undefined>[]` — backward compat with prerun `.getPColumns()`
- `TreeNodeAccessor` — convenience overload on builder only (internally calls `getPColumns()`). NOT part of `ColumnSource` type — helpers require `.toColumnSource()` conversion.

**`addSource` does NOT accept `undefined`.** If a source isn't available yet (e.g., `ctx.prerun?.resolve(...)` returns `undefined`), the caller should return `undefined` from the output lambda before reaching `addSource`.

**Anchor resolution at build time.** When `build({ anchors })` is called, each anchor value is resolved: `PObjectId` or `PlRef` (stringified via `canonicalize()` to `PObjectId`) is looked up via `getColumn(id)` on sources to find the anchor's `PColumnSpec`. `PColumnSpec` is used directly. The resolved anchor specs feed both the `AnchoredIdDeriver` (for `SUniversalPColumnId` derivation) and the trunk axes (union of unique axes from all anchors) for `discoverColumns`. Future extension: an explicit `trunk?: AxesSpec` option on `build()` could override the auto-derived trunk when axis reconciliation between anchors becomes necessary.

### ColumnSnapshot Type

```typescript
interface ColumnSnapshot<Id extends PObjectId = PObjectId> {
  readonly id: Id;
  readonly spec: PColumnSpec;
  readonly dataStatus: "ready" | "computing" | "absent";

  /**
   * Lazy data accessor. Active object preserving lazy loading semantics.
   * - 'ready': data.get() returns column data, context stays stable
   * - 'computing': data.get() returns undefined, marks context unstable
   * - 'absent': data is undefined (no active object exists)
   */
  readonly data: ColumnData | undefined;
}

interface ColumnData {
  get(): PColumnDataUniversal | undefined;
}
```

**Why `'absent'` = no active object.** The `data` field is `undefined`. No instability possible. If data will never arrive, there's nothing to access — the cleanest representation.

**Why `'computing'` always marks unstable on access.** A block developer who checks `dataStatus` first and avoids accessing data for non-ready columns prevents instability. A developer who doesn't check and just passes snapshots to a table helper is correctly marked unstable — the output genuinely depends on unready data. The easy path does the right thing (progressive disclosure).

**Implementation note:** Alexander will explore the exact active object form during implementation. The spec states requirements (lazy loading, automatic instability marking); the implementation may use a class, proxy, or other pattern. The `ColumnData` interface above is indicative — the key contract is: accessing data when computing marks unstable, accessing when ready returns data. `markUnstable: false` opt-in may still exist on the active object for advanced use cases.

**`dataStatus` detection logic:**

| Condition                                              | Status        |
| ------------------------------------------------------ | ------------- |
| No data resource exists and field list is locked/final | `'absent'`    |
| Data resource exists, `getIsReadyOrError() === true`   | `'ready'`     |
| Data resource exists, `getIsReadyOrError() === false`  | `'computing'` |

### ColumnProvider Interface

The provider is a **data source** — it enumerates columns, reports data status and column list completeness, and provides raw data access. It knows nothing about the render framework, stability tracking, labels, anchoring, or splitting. All that complexity lives in `ColumnCollection`.

```typescript
interface ColumnProvider {
  /** Returns currently known columns matching the selectors. */
  selectColumns(
    selectors: ((spec: PColumnSpec) => boolean) | ColumnSelector | ColumnSelector[],
  ): ProviderColumn[];

  /** Direct lookup by provider-native ID. Used for anchor resolution at build time —
   *  the builder resolves PObjectId/PlRef anchors by calling this on each source. */
  getColumn(id: PObjectId): ProviderColumn | undefined;

  /** Whether the provider has finished enumerating all its columns.
   *  Calling this may mark the render context unstable — it touches the
   *  reactive tree to check field resolution state. The builder calls this
   *  to decide whether build() returns a collection or undefined. */
  isColumnListComplete(): boolean;
}

interface ProviderColumn {
  readonly id: PObjectId;
  readonly spec: PColumnSpec;
  readonly dataStatus: "ready" | "computing" | "absent";
  getData(): PColumnDataUniversal | undefined;
}
```

Each provider computes `dataStatus`, `isColumnListComplete()`, and `getColumn()` from its own data layer:

| Provider                | `dataStatus`                                                                                                     | `isColumnListComplete()`                        | `getColumn(id)`                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| **ResultPool**          | No data resource + field locked → `'absent'`; `getIsReadyOrError()` → `'ready'` / `'computing'`                  | `true` when all field lists are final/locked    | Lookup by `canonicalize(PlRef)` — delegates to `getSpecFromResultPoolByRef` |
| **ArrayColumnProvider** | Always `'ready'` (data provided at construction)                                                                 | Always `true`                                   | Linear scan by ID                                                           |
| **Output adapter**      | `allowPermanentAbsence` + `getIsFinal()` → `'absent'`; field resolution semantics for `'computing'` vs `'ready'` | `true` when output field resolution is complete | Lookup in resolved output fields                                            |

Both collection types wrap `ProviderColumn` into `ColumnSnapshot`, adding:

- Active object construction with instability marking (render framework concern)
- `ColumnCollection`: keeps provider-native `PObjectId`, filters via `selectColumns` on providers
- `AnchoredColumnCollection`: derives `SUniversalPColumnId` via `AnchoredIdDeriver`, performs axis-aware discovery via `pSpecDriver.discoverColumns` WASM, returns `ColumnMatch[]` with qualification mappings and linker paths

**Why `markUnstable` is not on the provider for data access:** The provider's `getData()` returns raw data. It does not touch the computable framework. `ColumnCollection` constructs the active object on `ColumnSnapshot` which checks `dataStatus`, conditionally calls `ctx.markUnstable()`, and only then delegates to the provider's `getData()` (which is only called when status is `'ready'` — no accidental instability from touching an unready `TreeNodeAccessor`).

**Why `isColumnListComplete()` may mark unstable:** Checking whether "all columns are enumerated" requires reading reactive state (field finality, resolution progress). This is a framework interaction, not a data access — but it's still a reactive dependency. The builder reads this once during `build()`. If a provider's column list is incomplete and `allowPartialColumnList` is not set, `build()` returns `undefined` — the framework will re-render when the reactive state changes.

### Delegation to `discoverColumns`

The two collection types use different discovery mechanisms:

**`ColumnCollection.findColumns`** — delegates to `provider.selectColumns()` on each source. Pure TypeScript filtering, no WASM call. Deduplicates by `PObjectId` (first source wins). Returns `ColumnSnapshot<PObjectId>[]`.

**`AnchoredColumnCollection.findColumns`** — delegates to `pSpecDriver.discoverColumns` (Phase 3, Rust/WASM). The call flow:

1. **Anchors resolved at build time** — anchor specs already available as `PColumnSpec`. `AnchoredIdDeriver` ready. Trunk axes = union of unique axes from all anchors.
2. **Build request** — translate `include`/`exclude` into `ColumnSelector`, trunk axes into `AxesSpec`, `mode` into `MatchingConstraints` for `discoverColumns` (see `MatchingMode` mapping); `maxLinkerHops` maps to `maxHops`
3. **Call `pSpecDriver.discoverColumns`** — the WASM function performs all matching: direct axis compatibility, linker traversal, contextDomain qualification, `excludeColumns` filtering
4. **Construct `ColumnMatch[]`** — map `DiscoverColumnsHit[]` to `ColumnMatch[]`: derive `SUniversalPColumnId` via `AnchoredIdDeriver`, detect `dataStatus`, construct active objects, preserve `MatchVariant[]` with qualifications and linker steps

All matching logic lives in `discoverColumns`. `findColumns` handles the SDK-specific concerns: anchor/ID derivation, data status detection, snapshot construction, and variant preservation.

### Label Derivation

```typescript
// Pure computation — returns labels without modifying specs
// Standalone function for dropdowns, option lists, custom displays
function deriveLabels(
  snapshots: ColumnSnapshot[],
  opts?: LabelDerivationOps,
): { snapshot: ColumnSnapshot; label: string }[];

// Born deprecated — backward compat only. New code never needs this.
// Table and graph helpers derive labels internally.
function writeLabelsToSpecs(labeled: { snapshot: ColumnSnapshot; label: string }[]): void;
```

### Axis Splitting

Splitting is a separate utility — not part of `findColumns`. Only `clonotype-browser` uses splits (4 usages, all splitting on `sampleId`). Sheet/tab enumeration (`getUniquePartitionKeys`) is an orthogonal concern — unchanged.

```typescript
// Operates on already-discovered snapshots
// Adds trace annotations — not labels
function expandByPartition(
  snapshots: ColumnSnapshot[],
  splitAxes: { idx: number }[],
  opts?: {
    /** Resolve human-readable labels for axis key values */
    axisLabels?: (axisId: AxisId) => Record<string | number, string> | undefined;
  },
): { snapshots: ColumnSnapshot[]; complete: boolean };
```

Each source snapshot expands into K snapshots (one per unique partition key combination). Each expanded snapshot has:

- `spec.axesSpec` with split axes removed
- `spec.annotations['pl7.app/trace']` augmented with `{ type: "split:<axisId>", label: "<axis value label>", importance: 1_000_000 }` per split axis value
- `data` filters to the matching partition

When `complete: false`, partition data is not yet available — snapshots list is empty.

`deriveLabels` handles split entries naturally: the high-importance trace entries ensure split values appear prominently in labels. No split-specific label logic needed.

### Table and Graph Helpers

Tables and graphs accept column sources directly. Block developers pass `ColumnSource | ColumnSource[]` — the helpers internally build a collection, discover columns, call `deriveLabels`, and handle all `pl7.app/label` annotation plumbing. Block developers never write labels to specs.

```typescript
function createPlDataTableV3<A, U>(
  ctx: RenderCtxBase<A, U>,
  sources: ColumnSource | ColumnSource[],
  tableState: PlDataTableStateV2 | undefined,
  ops?: CreatePlDataTableV3Ops,
): PlDataTableModel | undefined;

function createPFrameForGraphsV2<A, U>(
  ctx: RenderCtxBase<A, U>,
  sources: ColumnSource | ColumnSource[],
  ops?: CreatePFrameForGraphsV2Ops,
): PFrameHandle | undefined;
```

The helper internally:

1. Creates a `ColumnCollectionBuilder`, adds all sources, calls `build({ anchors: ops.anchors })` (anchored) or `build()` (plain)
2. On anchored collection: calls `findColumns({ include: ops.include, mode: ops.mode, maxLinkerHops: ops.maxLinkerHops })` → `ColumnMatch[]` with routing info for proper joins
3. Finds axis label columns: `findColumns({ include: { name: 'pl7.app/label' } })` — the default `'enrichment'` mode correctly filters to label columns whose single axis is in the trunk (floating source axes OK, floating hit axes rejected ⇒ the label column's axis must match a trunk axis)
4. Matches label columns to data column axes (existing `getMatchingLabelColumns` logic)
5. Calls `deriveLabels()` on data columns for header labels
6. Injects derived labels into spec copies
7. Constructs `SpecQuery` join tree using `ColumnMatch.variants` (qualifications, linker steps, `DropAxes`) — replaces today's flat join with `qualifications: []`
8. Creates table handle via `ctx.createPTableV2()`

**Note on `TreeNodeAccessor`:** Since `ColumnSource` does not include `TreeNodeAccessor`, blocks must call `.toColumnSource()` before passing to helpers. This surfaces conversion errors at the call site:

```typescript
// Correct — explicit conversion
createPlDataTableV3(ctx, [ctx.resultPool, prerunResult.toColumnSource()], tableState, ops);

// Won't compile — TreeNodeAccessor is not a ColumnSource
createPlDataTableV3(ctx, [ctx.resultPool, prerunResult], tableState, ops);
```

Graph component may re-derive labels on visible subset; this is internal to graphs.

### Table Display Control

Block developers should not write annotations to control how a table displays their columns. `CreatePlDataTableV3Ops` accepts display control declaratively:

```typescript
interface CreatePlDataTableV3Ops {
  // Column discovery — helper uses these when calling findColumns internally
  include?: ColumnSelector | ColumnSelector[];
  exclude?: ColumnSelector | ColumnSelector[];
  anchors?: Record<string, PObjectId | PlRef | PColumnSpec>;
  mode?: MatchingMode;
  maxLinkerHops?: number;

  // Existing from V2
  filters?: PlDataTableFilters;
  sorting?: PTableSorting[];
  coreColumnPredicate?: (spec: PColumnIdAndSpec) => boolean;
  coreJoinType?: "inner" | "full";

  // NEW: Column display control
  columnDisplay?: ColumnDisplayConfig;

  // NEW: Label derivation options
  labelOpts?: LabelDerivationOps;
}

interface ColumnDisplayConfig {
  /** Column ordering rules. Higher priority = further left. First matching rule wins. */
  ordering?: ColumnOrderRule[];
  /** Column visibility rules. First matching rule wins. Unmatched columns use default visibility. */
  visibility?: ColumnVisibilityRule[];
}

interface ColumnOrderRule {
  match: ColumnMatcher;
  /** Higher number = further left in table */
  priority: number;
}

interface ColumnVisibilityRule {
  match: ColumnMatcher;
  visibility: "default" | "optional" | "hidden";
}

type ColumnMatcher =
  | ((spec: PColumnSpec) => boolean)
  | { name: string | string[] }
  | { annotation: Record<string, string> }
  | { ids: Set<string> };
```

This replaces the ~90 lines of annotation mutation in Lead Selection and similar patterns in clonotype-browser (setting abundance columns to `optional` visibility) and `addLinkedColumnsToArray` (hiding linker columns).

### How Lead Selection Simplifies

**Current code** (~190 lines of label hacks + ~90 lines of annotation mutation in `model/src/index.ts`):

```typescript
// getColumns (util.ts) calls getAnchoredPColumns 3 times — forces data loading
// Returns undefined if ANY column data isn't ready
const columns = getColumns(ctx, ctx.args.inputAnchor);

// Then 4 derive-and-write-back passes, each overwriting pl7.app/label:
// 1. getAnchoredPColumns internally (overrideLabelAnnotation: true)
// 2. updateClusterColumnLabels — 60 lines, derives on cluster subset, writes back
// 3. disambiguateLabels — 50 lines, derives on duplicate-label groups, writes back
// 4. getDisambiguatedOptions — 36 lines, derives for dropdowns, writes back

// Then ~90 lines of annotation mutation for table display:
// Set pl7.app/table/visibility to hidden/default/optional
// Set pl7.app/table/orderPriority for column ordering
```

**New code:**

```typescript
// For dropdowns — specs only, available immediately
.output('filterConfig', (ctx) => {
  const collection = new ColumnCollectionBuilder()
    .addSource(ctx.resultPool)
    .build({ anchors: { main: ctx.args.inputAnchor } });
  if (!collection) return undefined;
  const matches = collection.findColumns({
    include: filterSelectors,
    maxLinkerHops: 1,  // include linked columns (e.g., cluster properties)
  });
  const labeled = deriveLabels(matches.map(m => m.column));
  return {
    options: labeled.map(({ snapshot, label }) => ({
      value: snapshot.id,
      label,
      column: snapshot.spec,
    })),
    defaults: computeFilterDefaults(matches),
  };
})

// For table — pass sources directly to createPlDataTableV3
.output('table', (ctx) => {
  return createPlDataTableV3(ctx,
    [ctx.resultPool, outputAccessor.toColumnSource()],
    tableState, {
      anchors: { main: ctx.args.inputAnchor },
      maxLinkerHops: 1,  // discover linked columns automatically
      coreColumnPredicate: (spec) => isCoreColumn(spec),
      columnDisplay: {
        ordering: [
          { match: { name: 'pl7.app/cloneLabel' }, priority: 1_000_000 },
          { match: (s) => isProteinSequence(s), priority: 999_000 },
          { match: (s) => isFilterOrRank(s, filterIds, rankIds), priority: 7_000 },
        ],
        visibility: [
          { match: (s) => isFilterOrRank(s, filterIds, rankIds), visibility: 'default' },
          { match: { annotation: { 'pl7.app/isLinkerColumn': 'true' } }, visibility: 'hidden' },
          { match: () => true, visibility: 'optional' },
        ],
      },
    },
  );
})
```

The four label functions (`updateClusterColumnLabels`, `disambiguateLabels`, `getDisambiguatedOptions`, `hasMultipleClusteringBlocks`) and ~90 lines of annotation mutation are deleted entirely. `deriveLabels` for dropdowns, sources + `columnDisplay` for table. Dropdowns appear without waiting for data.

### Related Files

| Component                                      | File                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| **PColumnCollection (to deprecate)**           | `sdk/model/src/render/util/column_collection.ts`                     |
| **ResultPool**                                 | `sdk/model/src/render/api.ts`                                        |
| **Label derivation**                           | `sdk/model/src/render/util/label.ts`                                 |
| **ColumnProvider interface**                   | `sdk/model/src/render/util/column_collection.ts:50-54`               |
| **AxisLabelProvider (to deprecate)**           | `sdk/model/src/render/util/column_collection.ts:56-58`               |
| **Split selectors**                            | `sdk/model/src/render/util/split_selectors.ts`                       |
| **Partition data utilities**                   | `sdk/model/src/render/util/pcolumn_data.ts`                          |
| **createPlDataTableV2 (to deprecate)**         | `sdk/model/src/components/PlDataTable/table.ts`                      |
| **createPFrameForGraphs (to deprecate)**       | `sdk/model/src/components/PFrameForGraphs.ts`                        |
| **Table column headers (reads pl7.app/label)** | `sdk/ui-vue/src/components/PlAgDataTable/sources/table-source-v2.ts` |
| **Lead Selection model**                       | `blocks/antibody-tcr-lead-selection/model/src/index.ts`              |
| **Lead Selection utils**                       | `blocks/antibody-tcr-lead-selection/model/src/util.ts`               |
| **Clonotype Browser (only split user)**        | `blocks/clonotype-browser/model/src/index.ts`                        |
| **Cell Browser (ColumnCollection user)**       | `blocks/cell-browser/model/src/index.ts`                             |

### Defaults & Edge Cases

| Case                                              | Handling                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| No columns match selector                         | `findColumns` returns empty `[]` / `ColumnMatch[]` (collection exists, nothing matched)                                |
| Column lists still loading                        | `build()` returns `undefined` (default) or collection with `columnListComplete: false` (with `allowPartialColumnList`) |
| No data resource, field list locked               | `dataStatus: 'absent'`, `data` is `undefined`, no instability possible                                                 |
| `data.get()` on computing column                  | Returns `undefined`, marks unstable                                                                                    |
| `data.get()` on ready column                      | Returns data, context stays stable                                                                                     |
| Source is `undefined` (e.g. prerun not ready)     | `addSource` does not accept `undefined` — caller returns `undefined` from output lambda before reaching `addSource`    |
| `expandByPartition` when partition data not ready | Returns `{ snapshots: [], complete: false }`                                                                           |
| `expandByPartition` with missing axis labels      | Falls back to raw axis values (existing behavior)                                                                      |
| Selector that formerly used `split: true`         | `findColumns` returns the unsplit column snapshot / match — caller must use `expandByPartition` separately             |

---

## Codebase Context

Trace through these questions before starting implementation. Each builds on the previous.

1. Open `sdk/model/src/render/api.ts:205-222` — `getAnchoredPColumns`. It creates a `PColumnCollection`, adds the result pool as provider, then calls one method. What method does it call, and what does `overrideLabelAnnotation: true` do?

2. Follow that call into `sdk/model/src/render/util/column_collection.ts:556-584` — `getColumns`. After getting entries, it eagerly loads data for every column. What happens to the return value if a single column's data isn't ready?

3. In the same file, read `getUniversalEntries` (~line 266). This is the lazy version — but find where it calls `deriveLabels`. Can you get entries from this method without triggering label derivation? Also find the split processing block (~line 340-450) — where does it load partition data, and why can't this be part of spec-only discovery?

4. Look at the `ColumnProvider` interface (same file, lines 50-54). Then look at how `ResultPool.selectColumns` constructs its return value in `api.ts:475-506`. The `data` property is a getter — what happens when you access it? Why is this obscure for callers who only need specs?

5. Open `blocks/antibody-tcr-lead-selection/model/src/util.ts:129-281` — `getColumns`. It calls `getAnchoredPColumns` three times. Now check which outputs in `model/src/index.ts` call `getColumns`: `filterConfig`, `rankingConfig`, `hasClusterData`, `pf`, `table`. For the first three, does the output use any column data, or only specs/annotations?

6. Still in `model/src/index.ts`, trace the label chain: `updateClusterColumnLabels` (68-127) → `disambiguateLabels` (174-223) → `getDisambiguatedOptions` (133-168). Each calls `deriveLabels` on a different subset and writes the result to `pl7.app/label`. If column X appears in two subsets, what label does it end up with?

7. Open `sdk/workflow-tengo/src/pframes/export-pframe.lib.tengo:93-102`. When `hideDataFromUi` is true, what does the export produce? Now back in the SDK — when a block queries this column via `getAnchoredPColumns`, how does it distinguish this column from one whose data is still computing?

8. Open `blocks/clonotype-browser/model/src/index.ts` and find where it creates a `PColumnCollection` with prerun outputs + result pool. This is the closest existing pattern to the new builder API. What's missing from this pattern to make it work as the general solution?

---

## Alternatives Considered

**Add a `specsOnly` flag to `getAnchoredPColumns`.** The minimal change — skip data loading when the caller doesn't need data. Fails because it doesn't address per-column data status (still all-or-nothing for specs), doesn't solve the label write-back chain (labels are derived inside the query regardless), and doesn't distinguish absent from computing.

**Expose `getUniversalEntries` as the public API.** It already returns lazy entries with a data function — seems close. But it calls `deriveLabels` unconditionally during the query (coupling labels to discovery), and during axis splits it loads partition data to enumerate split values. The label write-back problem persists, and `dataStatus` has nowhere to live.

**Add `dataStatus` to the existing `PColumn<T>` type.** Avoids introducing `ColumnSnapshot`. But `PColumn` is used across providers, helpers, and rendering. Its `data` property is a proxy getter that implicitly marks the render context unstable on access. Adding `dataStatus` to it doesn't solve the implicit-access problem — callers would still trigger instability by touching `.data` when they only meant to check status.

**Fix labels per-block.** Each block manages its own `deriveLabels` calls on the right subsets. This is what Lead Selection already does — 190 lines of it. Doesn't scale: every block rediscovers the same pattern, and the underlying API still forces data loading and label write-back on every query.

**Set `overrideLabelAnnotation: false` by default.** Stop writing labels during `getAnchoredPColumns`, let blocks derive on their own. Native labels (`pl7.app/label`) are often too generic for disambiguation — blocks need derived labels for any multi-source display. Without the new `findColumns` → `deriveLabels` separation, blocks end up reimplementing the same write-back pattern that caused the problem.

---

## Kickoff Sync

Before starting, walk through these points together (~30 min):

1. **Three data states.** Walk through how `'ready'`, `'computing'`, and `'absent'` map to existing computable framework signals: `getIsReadyOrError()` for ready vs computing, field finality for absent. Where in the current code are these signals available, and why aren't they exposed to block developers today?

2. **Why `getUniversalEntries` isn't "almost there."** It looks like it returns lazy entries — but walk through the two places where it still couples concerns: unconditional `deriveLabels` call during the query, and partition data loading during axis splits. The new `findColumns` must avoid both.

3. **Output provider adapter.** Walk through the Lead Selection table output — how it mixes result pool columns (`getAnchoredPColumns`) with workflow outputs (`ctx.outputs.resolve`). The adapter must handle `allowPermanentAbsence`, `getIsFinal`, and field resolution semantics. What does the clonotype-browser pattern (prerun + result pool in one collection) tell us about how this should work?

4. **`ColumnProvider` is a data source, not a framework participant.** The interface has `selectColumns` returning `ProviderColumn[]`, `getColumn(id)` for direct lookup (used by anchor resolution), and `isColumnListComplete()` returning a boolean. Providers compute `dataStatus` from their own data layer. `markUnstable` for data access is NOT on the provider — it's added by collections when constructing the active object on `ColumnSnapshot`. But `isColumnListComplete()` may itself mark unstable (it reads reactive state). All complex behavior (anchoring, ID derivation, splitting, labels, dedup, stability tracking) lives in the collection layer (`ColumnCollection` / `AnchoredColumnCollection`). Walk through the three implementations: ResultPool (`getColumn` via `canonicalize(PlRef)` lookup, TreeNodeAccessor-based status, field finality for list completeness), ArrayColumnProvider (always ready, always complete), output adapter (field resolution + finality).

5. **Splitting is a separate utility, not part of `findColumns`.** Only `clonotype-browser` uses splits (all 4 usages split on `sampleId`). Splitting requires partition data — fundamentally incompatible with spec-only discovery. The `expandByPartition()` utility operates on snapshots after `findColumns`, adds trace annotations to specs, and lets `deriveLabels` handle labeling naturally. The trap: trying to make splits part of `findColumns` forces data loading during discovery and couples structural transformation to the discovery API.

---

## Milestones

_Start: March 4 (Elena/Sasha). M1 runs parallel with Phase 3. M2 is gated on Phase 3 M2 (March 12)._

### M1: SDK API — March 7

`ColumnCollectionBuilder`, `ColumnCollection`, `AnchoredColumnCollection`, `ColumnSnapshot<Id>`, `ColumnMatch`, `ColumnSource`, `ColumnProvider` extension with `getColumn(id)` and `isColumnListComplete()`, output provider adapter, table/graph V3 helpers, `expandByPartition`, deprecations. All work independent of Phase 3 — `AnchoredColumnCollection.findColumns` matching logic can use a stub/mock until `discoverColumns` WASM is available.

**Acceptance criteria:**

- [ ] `ColumnSnapshot<Id>` generic type with `dataStatus` and active object data accessor
- [ ] `ColumnCollectionBuilder` with `addSource` and `build()` producing `ColumnCollection` (plain) or `AnchoredColumnCollection` (with anchors)
- [ ] `ColumnCollection` with `findColumns(opts?)` → `ColumnSnapshot[]` and `getColumn(id)` for point lookup
- [ ] `AnchoredColumnCollection` with `findColumns(opts?)` → `ColumnMatch[]` and `getColumn(id)` for point lookup
- [ ] `ColumnMatch` type with `column`, `originalId`, `variants`
- [ ] `ColumnSource` type, `TreeNodeAccessor.toColumnSource()` method
- [ ] `ColumnProvider.getColumn()` and `isColumnListComplete()` implemented on ResultPool, ArrayColumnProvider, output adapter
- [ ] `createPlDataTableV3` and `createPFrameForGraphsV2` accepting `ColumnSource | ColumnSource[]`
- [ ] `expandByPartition` adds trace annotations (not labels)
- [ ] `writeLabelsToSpecs` exists but marked deprecated
- [ ] `getAnchoredPColumns`, `getCanonicalOptions`, `getColumns`, `getUniversalEntries` annotated `@deprecated`
- [ ] `getOptions` and `selectColumns` NOT deprecated
- [ ] `AxisLabelProvider` eliminated — axis labels resolved through column queries

### M2: Integration + Lead Selection Migration — March 13

Wire `findColumns` → `discoverColumns` (Phase 3 M2 available March 12). Migrate Lead Selection to new API.

**Acceptance criteria:**

- [ ] `AnchoredColumnCollection.findColumns` delegates matching to `pSpecDriver.discoverColumns`; returns `ColumnMatch[]` with `MatchVariant[]` from discovery; `maxLinkerHops` maps to `maxHops`
- [ ] `updateClusterColumnLabels`, `disambiguateLabels`, `getDisambiguatedOptions`, `hasMultipleClusteringBlocks` deleted from Lead Selection
- [ ] ~90 lines of annotation mutation replaced with `columnDisplay` config
- [ ] Filter/ranking dropdowns appear before data loads
- [ ] Table works correctly with mixed result pool + output columns
- [ ] No functional regression in Lead Selection behavior

---

## Risks

- **ColumnProvider interface redesign scope.** Extending the provider interface (`getColumn(id)`, `isColumnListComplete()`, `dataStatus` on `ProviderColumn`) affects `ResultPool`, `ArrayColumnProvider`, and any future providers. If the interface becomes too rich, simpler providers become harder to implement. Mitigation: keep the extended interface minimal; complex behavior lives in `ColumnCollection`, not providers.
- **New V3 helpers alongside old V2.** `createPlDataTableV2` (57 usages) and `createPFrameForGraphs` (61 usages) stay deprecated but functional. New `createPlDataTableV3` and `createPFrameForGraphsV2` are separate functions — no breaking changes. Migration is per-block.
- **Backward compatibility during transition.** Old and new APIs coexist. Blocks mixing old `getAnchoredPColumns` (which derives labels) with new `findColumns` (which doesn't) could produce inconsistent labels. Mitigation: old API continues to work as-is; new API is a clean separate path.

---

## Effort Estimates

| Area           | Days |
| -------------- | ---- |
| **TypeScript** | ~4   |
| **Block**      | ~1   |

---

## References

- Related: `work/projects/in-vivo-lead-selection/` — triggered the investigation
- Related: `work/projects/unified-block-state-finalization/` — V3 migration context
- Background research: [`background.md`](background.md) — detailed code analysis, SDK internals, block patterns
