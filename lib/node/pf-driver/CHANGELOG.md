# @milaboratories/pf-driver

## 1.7.7

### Patch Changes

- Updated dependencies [f7c21df]
  - @milaboratories/pl-model-middle-layer@1.30.3

## 1.7.6

### Patch Changes

- 51c4c8e: pf-driver: retain the resolved column-spec map on the JS side in `PFrameHolder` and serve `getColumnSpec` (and the column lookup inside `getUniqueValues`) from it as an O(1) map read, instead of scanning `pFrameSpec.listColumns()` on every call.
- Updated dependencies [51c4c8e]
  - @milaboratories/pl-model-middle-layer@1.30.2

## 1.7.5

### Patch Changes

- d314bbb: PFrames update: adopt self-contained datainfo (V6/V17/V8) interfaces and drop the superseded V5/V16/V7 ones.
- Updated dependencies [d314bbb]
  - @milaboratories/pl-model-middle-layer@1.30.1

## 1.7.4

### Patch Changes

- 8cbe874: Fix `ConcurrencyLimitingExecutor` permanently wedging the queue when a cancelled
  task never settles. `run` now accepts an optional `AbortSignal`: a task cancelled
  while queued gives up its slot at admission without running its body, and a running
  task is raced against the signal so the slot is always released on abort — even if
  the underlying operation ignores the signal. The pf-driver table/frame operations
  (`getShape`, `getData`, `writePTableToFs`, `exportPTable`, `calculateTableData`,
  `getUniqueValues`) now pass their abort signal to the limiter, so a cancelled or
  disposed request can no longer block all subsequent requests behind the single
  concurrency slot.
- Updated dependencies [8cbe874]
  - @milaboratories/ts-helpers@1.8.3

## 1.7.3

### Patch Changes

- Updated dependencies [5eb93c5]
  - @milaboratories/pl-model-middle-layer@1.30.0

## 1.7.2

### Patch Changes

- 60b13d1: Gate the xlsx export option in the UI on table size instead of failing after the dialog.

  `exportCsv` now calls `getShape` before opening the save dialog and drops the Excel filter when the table exceeds the per-sheet row limit, so oversized tables simply never offer xlsx rather than erroring out post-selection. The `pf-driver` rejection is kept as a safety net. The shared `XLSX_MAX_ROWS_PER_SHEET` constant is now exported from `@milaboratories/pl-model-common` so the UI gate and the driver check can't drift.

- Updated dependencies [60b13d1]
  - @milaboratories/pl-model-common@1.46.0
  - @milaboratories/pl-model-middle-layer@1.29.2

## 1.7.1

### Patch Changes

- c9dccff: Bump `@milaboratories/pframes-rs-*` to 1.1.42 and migrate the PFrame driver to the `PTableV11` / `PFrameReadAPIV14` / `PFrameV16` / `PFrameFactoryV7` interface family.

  `exportPTable` now honours `columnIndices`: it builds a unified column-index → header-name map and passes it to `PTableV11.export`, which both selects the columns to export and names them (emitted in ascending index order). The superseded `PTableV10` / `PFrameReadAPIV13` / `PFrameV15` / `PFrameFactoryV6` interfaces are removed.

- Updated dependencies [c9dccff]
  - @milaboratories/pl-model-middle-layer@1.29.1

## 1.7.0

### Minor Changes

- b0c2b5f: Add `PFrameDriver.exportPTable(handle, { path, columnIndices })` — exports the table to a file natively via `PTableV10.export`, selecting the format from the `path` extension (`csv`/`tsv`/`parquet`/`xlsx`). `columnIndices` selects the columns to export; column headers are derived on the driver side from each field's label annotation (falling back to its spec name), the same way `writePTableToFs` builds CSV/TSV headers. For `xlsx`, the driver checks the table shape and rejects exports whose data rows exceed the 1,000,000-row per-sheet limit (below Excel's hard cap of 1,048,576). The driver currently voids `columnIndices` and exports the full table — it will be honoured once the `PTableV11` native update lands.

  Add the next PFrames addon interface version — `PFrameFactoryV7` / `PFrameV16` / `PFrameReadAPIV14` / `PTableV11` — where `PTableV11.export` takes `headers` as a `Record<number, string>` (unified column index → header name) that both selects the columns to export (its keys) and names them (its values), instead of a positional `string[]`. The current `V6`/`V15`/`V13`/`V10` surface is unchanged and still used by the driver; the new version is defined ahead of its PFrames implementation, after which the monorepo will migrate and drop the old one.

  `PlAgCsvExporter` no longer hardcodes the output format — it offers the available formats as save-dialog file-type filters and derives the format from the chosen path. When the runtime advertises `exportPTable` it exports the visible table handle directly (`csv`/`tsv`/`parquet`/`xlsx`, no gzip); otherwise it falls back to `writePTableToFs` (`csv`/`tsv`, plain or gzip-compressed depending on the chosen `.gz` extension).

### Patch Changes

- Updated dependencies [b0c2b5f]
  - @milaboratories/pl-model-common@1.45.0
  - @milaboratories/pl-model-middle-layer@1.29.0

## 1.6.0

### Minor Changes

- fbff717: Switch the PFrames addon surface to the `PFrameFactoryV6`/`PFrameV15`/`PTableV10` interface (`@milaboratories/pframes-rs-*` bumped to `1.1.41`) and drop the superseded `PFrameFactoryV5`/`PFrameV14`/`PFrameReadAPIV12`/`PTableV9` declarations.

  Add `PFrameDriver.exportPTable(handle, path)` to the driver surface and wire it through the service bridge. The method is a placeholder that always rejects with "not implemented" — the native export implementation will be added separately.

### Patch Changes

- Updated dependencies [fbff717]
  - @milaboratories/pl-model-common@1.44.0
  - @milaboratories/pl-model-middle-layer@1.28.0

## 1.5.2

### Patch Changes

- 59c92e1: Cache footprint instead of recalculating each time

## 1.5.1

### Patch Changes

- Updated dependencies [d2d7fe5]
  - @milaboratories/pl-model-middle-layer@1.27.0

## 1.5.0

### Minor Changes

- 98092a6: Migrate pf-driver to the pframes-rs 1.1.38 V5 addon surface.

  - Bump `@milaboratories/pframes-rs-{node,wasip2,wasm}` to `1.1.38`.
  - `pf-driver` switches off the V4 addon API: `createTableV2({ tableSpec, dataQuery })` → `createTable(dataQuery)`, the per-column `addColumnSpec`/`setColumnData` loop → a single bulk `addColumns(...)`, and `getUniqueValues` now sends pre-resolved indices (`UniqueValuesRequestV2`) — axis indices via `expandAxes` + `findTableColumn`, filters via WASM-spec's stateless `rewriteLegacyFilters`. `params.tableSpec` is retained on the JS-side cache only.
  - `pl-model-middle-layer` drops the obsolete V4-era `PFrameInternal` interfaces (`PFrameFactoryAPIV4`, `PFrameReadAPIV11`, `PTableV8`, `PFrameV13`, `PFrameFactoryV4`); the published addon now implements `PFrameV14`/`PFrameFactoryV5`.
  - `pf-spec-driver` / `pl-model-common` expose `rewriteLegacyFilters` on `PFrameSpecDriver` (wired through the service registry and workflow VM bridge).

### Patch Changes

- Updated dependencies [98092a6]
  - @milaboratories/pl-model-common@1.43.0
  - @milaboratories/pl-model-middle-layer@1.26.0

## 1.4.17

### Patch Changes

- Updated dependencies [0a3af02]
  - @milaboratories/pl-model-middle-layer@1.25.0

## 1.4.16

### Patch Changes

- Updated dependencies [7a8aeea]
  - @milaboratories/pl-model-middle-layer@1.24.0

## 1.4.15

### Patch Changes

- Updated dependencies [a5bc059]
  - @milaboratories/pl-model-middle-layer@1.23.0

## 1.4.14

### Patch Changes

- Updated dependencies [d9ede09]
  - @milaboratories/pl-model-middle-layer@1.22.0

## 1.4.13

### Patch Changes

- 62e11be: Prepare pf-driver for the next pframes-rs-node addon revision.

  - Declare V5 addon interfaces (`PFrameFactoryAPIV5`, `PTableV9`,
    `PFrameReadAPIV12`, `PFrameV14`, `PFrameFactoryV5`) alongside the V4
    ones so the next addon publish has a concrete TS contract to
    implement. The current V4 surface is unchanged.
  - Cache the WASM-spec frame on `PFrameHolder` and route
    `driver.findColumns`, `getColumnSpec`, `listColumns` through it
    instead of round-tripping through the addon. `getColumnSpec` and
    `listColumns` now return only value-typed columns — the queryable
    subset that exec can plan against.
  - Lower V1 `createPTable` inputs via WASM-spec at construction time
    and unify the def shape: `FullPTableDef` is now flat
    `{ pFrameHandle, tableSpec, dataQuery }` for both V1 and V2 entry
    points. The recursive sort/filter peeling in `createNewResourceV1`
    is dropped; the existing `createTableV2` path materialises the
    lowered query end-to-end.
  - Switch the `driver.getSpec` PTable read to a JS-side lookup from the
    cached def — no addon roundtrip.

  After this PR every existing V4 addon call still works; pf-driver
  just stops needing several of them. The remaining cutover (drop V4
  interface declarations, switch to V5 addon calls, send pre-resolved
  indices for `getUniqueValues`, bulk `addColumns`) lands in a follow-up
  once the addon publishes V5.

- Updated dependencies [62e11be]
  - @milaboratories/pl-model-middle-layer@1.21.0

## 1.4.12

### Patch Changes

- Updated dependencies [030e8c2]
  - @milaboratories/pl-model-middle-layer@1.20.0

## 1.4.11

### Patch Changes

- 2b928af: `pframe/query` types now mirror the pframes-rs wire format. Tracks
  `@milaboratories/pframes-rs-node` / `-wasm` v1.1.34 → v1.1.35.

  New variants on `SpecQuery` / `DataQuery`:

  - `transformColumns` query node (`QueryTransformColumns`); the mode
    is `"append" | "replace"` (the runtime accepts the legacy `"add"`
    as a serde alias).
  - `cast`, `conditional` expressions.
  - `ranking` window function (with `RankingKind`).

  `isInPolygon`, `aggregation` (`AggregationKind`), and `cumulative`
  (`CumulativeOperand`) are present in the Rust query model but their
  DataFusion executors return errors today (filter.rs:276 / 340 / 387).
  The TS definitions are committed but commented out in `query_common.ts`
  so block authors can't construct a query the runtime won't execute.
  Re-enable in lock-step with the Rust wiring.

  Wire-shape fixes:

  - `ExprIfNull` is now `ExprFillNull`, tag `"fillNull"` (the runtime
    accepts `"ifNull"` as a serde alias).
  - `NumericBinaryOperand` gains `"power"`.
  - `Point2D` is now an `[x, y]` tuple, matching the Rust serialisation
    (previously typed as `{ x, y }`).
  - `ExprIsIn.negate` is now required `boolean` (previously optional).
    The Rust runtime keeps a tolerant deserialiser that defaults a
    missing `negate` to `false` and always re-emits the field; new
    callers should pass it explicitly.
  - `QuerySort.sortBy[].nullsFirst` is plain `boolean` (was
    `null | boolean`).
  - `QuerySparseToDenseColumn`: field renamed `axesIndices → axes` and
    parameterised over the layer's axis-selector type; at the spec layer
    entries are named `SingleAxisSelector`s, at the data layer they are
    numeric indices. Old wire field name still parses via a serde alias.

  One downstream consumer in `@platforma-sdk/model`
  (`filters/converters/filterToQuery.ts`) updated to pass `negate`
  explicitly on the `inSet` / `notInSet` paths and to migrate from
  `ifNull` to `fillNull`.

- Updated dependencies [2b928af]
  - @milaboratories/pl-model-common@1.42.0
  - @milaboratories/pl-model-middle-layer@1.19.4

## 1.4.10

### Patch Changes

- 846df2e: PFrames update - fixed bug in PColumn combination

## 1.4.9

### Patch Changes

- Updated dependencies [641c845]
  - @milaboratories/pl-model-common@1.41.2
  - @milaboratories/pl-model-middle-layer@1.19.3

## 1.4.8

### Patch Changes

- Updated dependencies [6bac267]
  - @milaboratories/helpers@1.14.2
  - @milaboratories/pl-model-common@1.41.1
  - @milaboratories/pl-model-middle-layer@1.19.2
  - @milaboratories/ts-helpers@1.8.2

## 1.4.7

### Patch Changes

- Updated dependencies [cb9e0ba]
  - @milaboratories/pl-model-common@1.41.0
  - @milaboratories/pl-model-middle-layer@1.19.1

## 1.4.6

### Patch Changes

- Updated dependencies [72a9e61]
  - @milaboratories/pl-model-middle-layer@1.19.0
  - @milaboratories/pl-model-common@1.40.0
  - @milaboratories/ts-helpers@1.8.1
  - @milaboratories/helpers@1.14.1

## 1.4.5

### Patch Changes

- Updated dependencies [731ab44]
  - @milaboratories/pl-model-common@1.39.0
  - @milaboratories/pl-model-middle-layer@1.18.10

## 1.4.4

### Patch Changes

- Updated dependencies [6369956]
  - @milaboratories/pl-model-common@1.38.0
  - @milaboratories/pl-model-middle-layer@1.18.9

## 1.4.3

### Patch Changes

- a40505e: Add `EnrichmentRef` — a versioned envelope around a terminal column hit
  and an ordered linker path, mirroring `PrimaryRef`'s pattern so the
  dependency scanner deep-walks `PlRef`s inside it without changes. Adds
  `EnrichmentStep`, `isEnrichmentRef`, `createEnrichmentRef` exports.
  Today only `linker` steps are supported; the `type` discriminant leaves
  room for future step kinds.

  `tableBuilder.addColumn` / `addColumns` accept `EnrichmentRef` and
  `ResolvedEnrichmentRef`. The `:pframes.build-table` ephemeral registers
  the hit + every hop column in the PFrame, calls
  `pframes.build-query.buildQuery` to assemble the query, and hands the
  resulting `SpecQueryJoinEntry` straight to `pt.p._rawQueryEntry` — ptabler
  resolves the linker join natively, no node-by-node translation.

  Adds `pt.p._rawQueryEntry(columnsByName, joinEntry)` (internal — `_`
  prefixed) for wrapping a pre-built `SpecQueryJoinEntry` (e.g. from
  `bquery.buildQuery`) into a PEntry. Application code should compose
  with the public builders (`p.column / p.inner / p.linkerJoin / …`).

  The spec distiller now preserves the `pl7.app/isLinkerColumn`
  annotation on column specs (all other annotations are still stripped).
  ptabler reads this annotation at execution time to populate the spec
  frame's linker index — without it, `linkerJoin` queries silently
  degrade to inner joins.

  Drops the `qualifications` field from the typed shapes of
  `DiscoverColumnsLinkerStep`, `MatchVariant.path[]` items, and
  `DiscoveredPColumn`'s linker path items. Per-step linker qualifications
  were always empty (qualifications attach to query/hit ends, not to
  intermediate steps) — `BuildQuery` already discarded them, and the
  tooltip / `createPlDataTableV3` consumers were forwarding empty arrays.

  `DiscoveredPColumnId` no longer carries per-step `qualifications` in
  its canonicalized JSON form. The Rust side still emits the field on
  the wire; the TS deserializer ignores it.

- Updated dependencies [a40505e]
  - @milaboratories/pl-model-common@1.37.0
  - @milaboratories/pl-model-middle-layer@1.18.8

## 1.4.2

### Patch Changes

- @milaboratories/pl-model-common@1.36.2
- @milaboratories/pl-model-middle-layer@1.18.7

## 1.4.1

### Patch Changes

- Updated dependencies [e5596f5]
  - @milaboratories/pl-model-common@1.36.1
  - @milaboratories/pl-model-middle-layer@1.18.6

## 1.4.0

### Minor Changes

- 5420fea: Add PTableDownloadFormat, DownloadPTableOptions, and DownloadPTableResult types for PTable file export support

### Patch Changes

- 5420fea: Replace legacy `PFrameDriver.writePTableToFs?` with two modern services:
  `Dialog.showSaveDialog` (new `main`-kind service for native save dialogs)
  and `PFrame.writePTableToFs` (now a required method on the UI-facing
  driver, accepting a caller-provided `path`). `exportCsv` in `ui-vue`
  now opens the save dialog and invokes the write as two separate
  service calls.
- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
  - @milaboratories/pl-model-common@1.36.0
  - @milaboratories/pl-model-middle-layer@1.18.5

## 1.3.11

### Patch Changes

- Updated dependencies [10eec21]
  - @milaboratories/pl-model-common@1.35.0
  - @milaboratories/pl-model-middle-layer@1.18.4

## 1.3.10

### Patch Changes

- Updated dependencies [a2304be]
  - @milaboratories/pl-model-common@1.34.1
  - @milaboratories/pl-model-middle-layer@1.18.3

## 1.3.9

### Patch Changes

- Updated dependencies [8eb112a]
- Updated dependencies [8eb112a]
  - @milaboratories/pl-model-common@1.34.0
  - @milaboratories/pl-model-middle-layer@1.18.2

## 1.3.8

### Patch Changes

- Updated dependencies [1411dea]
  - @milaboratories/pl-model-common@1.33.0
  - @milaboratories/pl-model-middle-layer@1.18.1

## 1.3.7

### Patch Changes

- Updated dependencies [49485fd]
  - @milaboratories/pl-model-middle-layer@1.18.0
  - @milaboratories/pl-model-common@1.32.1

## 1.3.6

### Patch Changes

- Updated dependencies [436d4a9]
  - @milaboratories/pl-model-common@1.32.0
  - @milaboratories/pl-model-middle-layer@1.17.0

## 1.3.5

### Patch Changes

- Updated dependencies [9c3b6c2]
  - @milaboratories/pl-model-common@1.31.2
  - @milaboratories/pl-model-middle-layer@1.16.4

## 1.3.4

### Patch Changes

- fc09bcb: PFrames bump

## 1.3.3

### Patch Changes

- 6dc9e0d: Move browser-safe types (MiLogger, RefCountPoolBase, isDisposable) from ts-helpers to helpers to fix Vite browser bundling error in ui-vue
- Updated dependencies [6dc9e0d]
  - @milaboratories/helpers@1.14.1
  - @milaboratories/ts-helpers@1.8.1
  - @milaboratories/pl-model-common@1.31.1
  - @milaboratories/pl-model-middle-layer@1.16.3

## 1.3.2

### Patch Changes

- Updated dependencies [5becf87]
  - @milaboratories/pl-model-common@1.31.0
  - @milaboratories/pl-model-middle-layer@1.16.2

## 1.3.1

### Patch Changes

- e44b64c: PFrames update

## 1.3.0

### Minor Changes

- 74a2ffa: Add block-level services infrastructure (PFrameSpec, PFrame)

  - Introduce `Services` registry in pl-model-common with service definitions, feature flags, and typed driver interfaces
  - Add `PFrameSpec` service: synchronous WASM-based spec operations (createSpecFrame, discoverColumns, evaluateQuery)
  - Wire services through block model, plugin model, and UI layers with compile-time `RequireServices` constraints
  - Add `ColumnCollection` with `dispose()` for deterministic spec frame cleanup. **Breaking:** `ColumnCollection` and `AnchoredColumnCollection` now extend `Disposable` — custom implementations must add a `dispose()` method
  - Add `createPlDataTable` v3 API using `ColumnCollectionBuilder` with include/exclude column selectors
  - Auto-dispose leaked SpecFrame handles via `addOnDestroy` in computable lifecycle. **Breaking:** `PFrameSpecDriver.createSpecFrame` now returns `PoolEntry<SpecFrameHandle>` instead of `SpecFrameHandle`; `disposeSpecFrame` removed — use `entry.unref()` instead
  - Add `PoolEntry`, `PoolEntryGuard` to pl-model-common for cross-package pool entry lifecycle management
  - Add `ServiceRegistryBase.dispose()` for proper service cleanup; wire disposal in middle layer and UI
  - Migrate `PFramePool` from `RefCountManualPoolBase` to `RefCountPoolBase` with idempotent unref; remove `RefCountManualPoolBase`
  - Add `requireComputableCtx` getter to centralize computable context guards; migrate `createPFrame`/`createPTable`/`createPTableV2` to use `PoolEntryGuard` for leak-safe resource handling
  - Move pf-spec-driver logging before WASM calls for better crash diagnostics
  - Fix outputWithStatus in plugin model
  - Fix table row selection not propagating to selection model
  - Fix linker columns with `pl7.app/parents` annotation failing WASM validation ("must have exactly 2 connected components") by resolving annotation-based parents to numeric `parentAxes` before passing specs to Rust/WASM engine

### Patch Changes

- Updated dependencies [74a2ffa]
  - @milaboratories/pl-model-common@1.30.0
  - @milaboratories/ts-helpers@1.8.0
  - @milaboratories/pl-model-middle-layer@1.16.1

## 1.2.0

### Minor Changes

- cfee265: Drop V1 DiscoverColumnsRequest/PFrameWasm/PFrameWasmAPI, adopt V2 interfaces; update DiscoverColumnsRequest in common with includeColumns/excludeColumns/maxHops fields; extract SpecDriver into @milaboratories/pf-spec-driver package; rename specFrameDispose to disposeSpecFrame for API consistency

### Patch Changes

- Updated dependencies [cfee265]
  - @milaboratories/pl-model-common@1.29.0
  - @milaboratories/pl-model-middle-layer@1.16.0

## 1.1.1

### Patch Changes

- Updated dependencies [e1d62fe]
  - @milaboratories/pl-model-common@1.28.0
  - @milaboratories/pl-model-middle-layer@1.15.0

## 1.1.0

### Minor Changes

- d59f5fe: New collection columns implementation

### Patch Changes

- Updated dependencies [d59f5fe]
  - @milaboratories/pl-model-middle-layer@1.14.0
  - @milaboratories/pl-model-common@1.27.0

## 1.0.68

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.13.1
- @platforma-sdk/model@1.59.3

## 1.0.67

### Patch Changes

- fc2de3a: Bump pframes-rs to 1.1.14

## 1.0.66

### Patch Changes

- Updated dependencies [b4036fb]
  - @milaboratories/pl-model-middle-layer@1.13.0
  - @platforma-sdk/model@1.59.0

## 1.0.65

### Patch Changes

- Updated dependencies [15959f8]
  - @platforma-sdk/model@1.58.22
  - @milaboratories/pl-model-middle-layer@1.12.12

## 1.0.64

### Patch Changes

- Updated dependencies [a93de45]
  - @platforma-sdk/model@1.58.19
  - @milaboratories/pl-model-middle-layer@1.12.11

## 1.0.63

### Patch Changes

- 79156bc: fix dense axis
- Updated dependencies [79156bc]
  - @milaboratories/pl-model-middle-layer@1.12.10
  - @milaboratories/ts-helpers@1.7.3
  - @platforma-sdk/model@1.58.11

## 1.0.62

### Patch Changes

- Updated dependencies [4d83b3c]
  - @platforma-sdk/model@1.58.9
  - @milaboratories/pl-model-middle-layer@1.12.9

## 1.0.61

### Patch Changes

- Updated dependencies [c2d9319]
  - @platforma-sdk/model@1.58.5
  - @milaboratories/pl-model-middle-layer@1.12.8

## 1.0.60

### Patch Changes

- Updated dependencies [327444c]
  - @platforma-sdk/model@1.58.3
  - @milaboratories/pl-model-middle-layer@1.12.7

## 1.0.59

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.12.6
- @platforma-sdk/model@1.58.2

## 1.0.58

### Patch Changes

- Updated dependencies [d318a76]
  - @platforma-sdk/model@1.58.1
  - @milaboratories/pl-model-middle-layer@1.12.5

## 1.0.57

### Patch Changes

- Updated dependencies [b5d19c6]
  - @platforma-sdk/model@1.58.0
  - @milaboratories/pl-model-middle-layer@1.12.4

## 1.0.56

### Patch Changes

- 6ba4c69: Apply user sorting above options
- Updated dependencies [6ba4c69]
  - @platforma-sdk/model@1.57.2
  - @milaboratories/pl-model-middle-layer@1.12.3

## 1.0.55

### Patch Changes

- a95fc4e: Update deps version

## 1.0.54

### Patch Changes

- 8baa2b3: PFrames version bump
- Updated dependencies [8baa2b3]
  - @platforma-sdk/model@1.57.0
  - @milaboratories/pl-model-middle-layer@1.12.2

## 1.0.53

### Patch Changes

- Updated dependencies [f2daf69]
  - @platforma-sdk/model@1.56.0
  - @milaboratories/pl-model-middle-layer@1.12.1

## 1.0.52

### Patch Changes

- 02b0416: PFrames version bump

## 1.0.51

### Patch Changes

- Updated dependencies [2ad9783]
  - @milaboratories/pl-model-middle-layer@1.12.0

## 1.0.50

### Patch Changes

- Updated dependencies [01d0b52]
  - @platforma-sdk/model@1.55.0
  - @milaboratories/pl-model-middle-layer@1.11.14

## 1.0.49

### Patch Changes

- cb28fde: FilterSpec strict types, fast table search
- Updated dependencies [cb28fde]
  - @platforma-sdk/model@1.54.13
  - @milaboratories/pl-model-middle-layer@1.11.13

## 1.0.48

### Patch Changes

- 866a323: Apply user filters, add utils method for traversing
- Updated dependencies [866a323]
  - @platforma-sdk/model@1.54.10
  - @milaboratories/pl-model-middle-layer@1.11.12

## 1.0.47

### Patch Changes

- Updated dependencies [a3659cd]
  - @platforma-sdk/model@1.54.9
  - @milaboratories/pl-model-middle-layer@1.11.11

## 1.0.46

### Patch Changes

- 4f04561: simplify distil , renaming
- Updated dependencies [4f04561]
  - @platforma-sdk/model@1.54.8
  - @milaboratories/pl-model-middle-layer@1.11.10

## 1.0.45

### Patch Changes

- 0ae1854: createPTableV2 + Advanced filter in AgTable
- Updated dependencies [0ae1854]
  - @milaboratories/pl-model-middle-layer@1.11.9
  - @platforma-sdk/model@1.54.7
  - @milaboratories/ts-helpers@1.7.2

## 1.0.44

### Patch Changes

- Updated dependencies [6689b53]
  - @milaboratories/pl-model-middle-layer@1.11.8

## 1.0.43

### Patch Changes

- 25a3d4e: pf-driver createTableByDataQuery

## 1.0.42

### Patch Changes

- c620234: remove unused packages
- Updated dependencies [c620234]
  - @milaboratories/pl-model-middle-layer@1.11.7
  - @platforma-sdk/model@1.53.15
  - @milaboratories/ts-helpers@1.7.2

## 1.0.41

### Patch Changes

- a6ea24f: silent ci tests
- Updated dependencies [a6ea24f]
  - @milaboratories/pl-model-middle-layer@1.11.6
  - @milaboratories/ts-helpers@1.7.2
  - @platforma-sdk/model@1.53.14

## 1.0.40

### Patch Changes

- f89a883: full integration oxc
- Updated dependencies [f89a883]
  - @milaboratories/pl-model-middle-layer@1.11.5
  - @milaboratories/ts-helpers@1.7.1
  - @platforma-sdk/model@1.53.13

## 1.0.39

### Patch Changes

- Updated dependencies [77db818]
  - @milaboratories/pl-model-middle-layer@1.11.4

## 1.0.38

### Patch Changes

- Updated dependencies [209554d]
  - @platforma-sdk/model@1.53.11
  - @milaboratories/pl-model-middle-layer@1.11.3

## 1.0.37

### Patch Changes

- Updated dependencies [d963d19]
  - @platforma-sdk/model@1.53.10
  - @milaboratories/pl-model-middle-layer@1.11.2

## 1.0.36

### Patch Changes

- Updated dependencies [b069fbe]
  - @milaboratories/pl-model-middle-layer@1.11.1

## 1.0.35

### Patch Changes

- Updated dependencies [7cca3e8]
  - @milaboratories/pl-model-middle-layer@1.11.0

## 1.0.34

### Patch Changes

- Updated dependencies [db932b2]
  - @milaboratories/pl-model-middle-layer@1.10.8

## 1.0.33

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.10.7
- @platforma-sdk/model@1.53.5

## 1.0.32

### Patch Changes

- @milaboratories/pl-model-middle-layer@1.10.6
- @platforma-sdk/model@1.53.4

## 1.0.31

### Patch Changes

- Updated dependencies [f459e5a]
  - @platforma-sdk/model@1.53.3
  - @milaboratories/pl-model-middle-layer@1.10.5

## 1.0.30

### Patch Changes

- Updated dependencies [57799dd]
  - @platforma-sdk/model@1.53.2
  - @milaboratories/pl-model-middle-layer@1.10.4

## 1.0.29

### Patch Changes

- Updated dependencies [a748b92]
  - @milaboratories/pl-model-middle-layer@1.10.3
  - @platforma-sdk/model@1.53.1

## 1.0.28

### Patch Changes

- Updated dependencies [43b4247]
  - @platforma-sdk/model@1.53.0
  - @milaboratories/pl-model-middle-layer@1.10.2

## 1.0.27

### Patch Changes

- Updated dependencies [48e8984]
  - @milaboratories/pl-model-middle-layer@1.10.1
  - @platforma-sdk/model@1.52.7

## 1.0.26

### Patch Changes

- Updated dependencies [a267fe8]
  - @milaboratories/ts-helpers@1.7.0

## 1.0.25

### Patch Changes

- Updated dependencies [1e4b72a]
  - @platforma-sdk/model@1.52.3

## 1.0.24

### Patch Changes

- Updated dependencies [1694d1a]
  - @milaboratories/pl-model-middle-layer@1.10.0
  - @milaboratories/ts-helpers@1.6.0
  - @platforma-sdk/model@1.52.0

## 1.0.23

### Patch Changes

- Updated dependencies [38534c5]
  - @platforma-sdk/model@1.51.9

## 1.0.22

### Patch Changes

- Updated dependencies [b0ceca1]
  - @platforma-sdk/model@1.51.6

## 1.0.21

### Patch Changes

- Updated dependencies [dd9a004]
  - @platforma-sdk/model@1.51.5

## 1.0.20

### Patch Changes

- Updated dependencies [5dc0a70]
  - @platforma-sdk/model@1.51.2

## 1.0.19

### Patch Changes

- Updated dependencies [fc75a16]
  - @platforma-sdk/model@1.50.0
  - @milaboratories/pl-model-middle-layer@1.9.1

## 1.0.18

### Patch Changes

- Updated dependencies [88f33fa]
  - @milaboratories/pl-model-middle-layer@1.9.0
  - @platforma-sdk/model@1.49.0

## 1.0.17

### Patch Changes

- Updated dependencies [d6856e2]
  - @platforma-sdk/model@1.48.14

## 1.0.16

### Patch Changes

- Updated dependencies [72bb768]
  - @platforma-sdk/model@1.48.13

## 1.0.15

### Patch Changes

- Updated dependencies [8abf3c6]
  - @platforma-sdk/model@1.48.12

## 1.0.14

### Patch Changes

- 36c5cc7: Make PFrameDriverError messages static

## 1.0.13

### Patch Changes

- f62e11c: Proper sparse cache disposal
  - @platforma-sdk/model@1.48.4

## 1.0.12

### Patch Changes

- Updated dependencies [3e168c4]
  - @platforma-sdk/model@1.48.4

## 1.0.11

### Patch Changes

- @platforma-sdk/model@1.48.2

## 1.0.10

### Patch Changes

- Updated dependencies [5deb79a]
  - @platforma-sdk/model@1.47.5
  - @milaboratories/pl-model-middle-layer@1.8.45

## 1.0.9

### Patch Changes

- Updated dependencies [a81ce44]
  - @platforma-sdk/model@1.46.0

## 1.0.8

### Patch Changes

- Updated dependencies [bf6fe49]
  - @platforma-sdk/model@1.45.45
  - @milaboratories/pl-model-middle-layer@1.8.44

## 1.0.7

### Patch Changes

- 4bfd1a7: PFrames version bump
- Updated dependencies [4bfd1a7]
  - @milaboratories/pl-model-middle-layer@1.8.43

## 1.0.6

### Patch Changes

- 2c07d5a: Return null instead of error when column not found
- Updated dependencies [2c07d5a]
  - @milaboratories/pl-model-middle-layer@1.8.42
  - @platforma-sdk/model@1.45.42

## 1.0.5

### Patch Changes

- Updated dependencies [d088e83]
  - @platforma-sdk/model@1.45.35
  - @milaboratories/pl-model-middle-layer@1.8.41

## 1.0.4

### Patch Changes

- Updated dependencies [17e5fe7]
  - @platforma-sdk/model@1.45.30
  - @milaboratories/pl-model-middle-layer@1.8.40

## 1.0.3

### Patch Changes

- 8996bed: Publish again, previous publish failed
- Updated dependencies [8996bed]
  - @milaboratories/pl-model-middle-layer@1.8.39
  - @milaboratories/ts-helpers@1.5.4

## 1.0.2

### Patch Changes

- 6af87a6: Node json helpers moved, new type exports from PFrameDriverDouble
- Updated dependencies [6af87a6]
  - @milaboratories/pl-model-middle-layer@1.8.38
  - @milaboratories/ts-helpers@1.5.3

## 1.0.1

### Patch Changes

- Updated dependencies [c3ce3ce]
  - @milaboratories/pl-model-middle-layer@1.8.37

## 1.0.0

### Major Changes

- 55b218b: PFrameDriver decomposed

### Patch Changes

- Updated dependencies [55b218b]
- Updated dependencies [5814e48]
  - @milaboratories/pl-model-middle-layer@1.8.36
  - @milaboratories/ts-helpers@1.5.2
  - @platforma-sdk/model@1.45.26
