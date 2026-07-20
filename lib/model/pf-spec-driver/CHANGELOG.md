# @milaboratories/pf-spec-driver

## 1.4.23

### Patch Changes

- db6bbfa: PFrames bump

## 1.4.22

### Patch Changes

- 27600c3: Escape including label columns for non primary columns
- Updated dependencies [27600c3]
  - @milaboratories/pl-model-middle-layer@1.30.14
  - @milaboratories/pl-model-common@1.47.2
  - @milaboratories/helpers@1.14.5

## 1.4.21

### Patch Changes

- Updated dependencies [3314d0c]
  - @milaboratories/helpers@1.14.4
  - @milaboratories/pl-model-common@1.47.1
  - @milaboratories/pl-model-middle-layer@1.30.13

## 1.4.20

### Patch Changes

- d65b190: PFrames bump

## 1.4.19

### Patch Changes

- Updated dependencies [881d6ba]
  - @milaboratories/pl-model-common@1.47.0
  - @milaboratories/pl-model-middle-layer@1.30.12

## 1.4.18

### Patch Changes

- Updated dependencies [c07d2bb]
  - @milaboratories/helpers@1.14.3
  - @milaboratories/pl-model-common@1.46.4
  - @milaboratories/pl-model-middle-layer@1.30.11

## 1.4.17

### Patch Changes

- Updated dependencies [3df748f]
  - @milaboratories/pl-model-common@1.46.3
  - @milaboratories/pl-model-middle-layer@1.30.10

## 1.4.16

### Patch Changes

- Updated dependencies [534a237]
  - @milaboratories/pl-model-middle-layer@1.30.9
  - @milaboratories/pl-model-common@1.46.2
  - @milaboratories/helpers@1.14.2

## 1.4.15

### Patch Changes

- 3a4036d: Bump `@milaboratories/pframes-rs-*` to 1.1.52, which now populates `bytesMissed` in the serv cache counters. Make `bytesMissed` required on `CacheCounters` accordingly.
- Updated dependencies [3a4036d]
  - @milaboratories/pl-model-middle-layer@1.30.8

## 1.4.14

### Patch Changes

- Updated dependencies [2760ae1]
- Updated dependencies [b863d05]
  - @milaboratories/pl-model-common@1.46.2
  - @milaboratories/pl-model-middle-layer@1.30.7

## 1.4.13

### Patch Changes

- 4df307e: PFrames bump

## 1.4.12

### Patch Changes

- Updated dependencies [508fdcb]
  - @milaboratories/pl-model-middle-layer@1.30.6

## 1.4.11

### Patch Changes

- Updated dependencies [48f8210]
  - @milaboratories/pl-model-middle-layer@1.30.5

## 1.4.10

### Patch Changes

- Updated dependencies [958289c]
  - @milaboratories/pl-model-common@1.46.1
  - @milaboratories/pl-model-middle-layer@1.30.4

## 1.4.9

### Patch Changes

- Updated dependencies [f7c21df]
  - @milaboratories/pl-model-middle-layer@1.30.3

## 1.4.8

### Patch Changes

- Updated dependencies [51c4c8e]
  - @milaboratories/pl-model-middle-layer@1.30.2

## 1.4.7

### Patch Changes

- d314bbb: PFrames update: adopt self-contained datainfo (V6/V17/V8) interfaces and drop the superseded V5/V16/V7 ones.
- Updated dependencies [d314bbb]
  - @milaboratories/pl-model-middle-layer@1.30.1

## 1.4.6

### Patch Changes

- Updated dependencies [5eb93c5]
  - @milaboratories/pl-model-middle-layer@1.30.0

## 1.4.5

### Patch Changes

- Updated dependencies [60b13d1]
  - @milaboratories/pl-model-common@1.46.0
  - @milaboratories/pl-model-middle-layer@1.29.2

## 1.4.4

### Patch Changes

- c9dccff: Bump `@milaboratories/pframes-rs-*` to 1.1.42 and migrate the PFrame driver to the `PTableV11` / `PFrameReadAPIV14` / `PFrameV16` / `PFrameFactoryV7` interface family.

  `exportPTable` now honours `columnIndices`: it builds a unified column-index → header-name map and passes it to `PTableV11.export`, which both selects the columns to export and names them (emitted in ascending index order). The superseded `PTableV10` / `PFrameReadAPIV13` / `PFrameV15` / `PFrameFactoryV6` interfaces are removed.

- Updated dependencies [c9dccff]
  - @milaboratories/pl-model-middle-layer@1.29.1

## 1.4.3

### Patch Changes

- Updated dependencies [b0c2b5f]
  - @milaboratories/pl-model-common@1.45.0
  - @milaboratories/pl-model-middle-layer@1.29.0

## 1.4.2

### Patch Changes

- Updated dependencies [fbff717]
  - @milaboratories/pl-model-common@1.44.0
  - @milaboratories/pl-model-middle-layer@1.28.0

## 1.4.1

### Patch Changes

- Updated dependencies [d2d7fe5]
  - @milaboratories/pl-model-middle-layer@1.27.0

## 1.4.0

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

## 1.3.22

### Patch Changes

- Updated dependencies [0a3af02]
  - @milaboratories/pl-model-middle-layer@1.25.0

## 1.3.21

### Patch Changes

- Updated dependencies [7a8aeea]
  - @milaboratories/pl-model-middle-layer@1.24.0

## 1.3.20

### Patch Changes

- Updated dependencies [a5bc059]
  - @milaboratories/pl-model-middle-layer@1.23.0

## 1.3.19

### Patch Changes

- Updated dependencies [d9ede09]
  - @milaboratories/pl-model-middle-layer@1.22.0

## 1.3.18

### Patch Changes

- Updated dependencies [62e11be]
  - @milaboratories/pl-model-middle-layer@1.21.0

## 1.3.17

### Patch Changes

- Updated dependencies [030e8c2]
  - @milaboratories/pl-model-middle-layer@1.20.0

## 1.3.16

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

## 1.3.15

### Patch Changes

- 846df2e: PFrames update - fixed bug in PColumn combination

## 1.3.14

### Patch Changes

- Updated dependencies [641c845]
  - @milaboratories/pl-model-common@1.41.2
  - @milaboratories/pl-model-middle-layer@1.19.3

## 1.3.13

### Patch Changes

- Updated dependencies [6bac267]
  - @milaboratories/helpers@1.14.2
  - @milaboratories/pl-model-common@1.41.1
  - @milaboratories/pl-model-middle-layer@1.19.2

## 1.3.12

### Patch Changes

- Updated dependencies [cb9e0ba]
  - @milaboratories/pl-model-common@1.41.0
  - @milaboratories/pl-model-middle-layer@1.19.1

## 1.3.11

### Patch Changes

- Updated dependencies [72a9e61]
  - @milaboratories/pl-model-middle-layer@1.19.0
  - @milaboratories/pl-model-common@1.40.0
  - @milaboratories/helpers@1.14.1

## 1.3.10

### Patch Changes

- 518ac71: Re-emit empty `qualifications: []` on linker steps in `discoverColumns` responses. pframes-rs >= 1.1.31 dropped the field from the wire shape, breaking older block bundles (e.g. clonotype-browser v1.1.11) that read `step.qualifications.length` without guarding. The shim restores compatibility until all blocks rebuild against an SDK that tolerates the absent field.

## 1.3.9

### Patch Changes

- Updated dependencies [731ab44]
  - @milaboratories/pl-model-common@1.39.0
  - @milaboratories/pl-model-middle-layer@1.18.10

## 1.3.8

### Patch Changes

- Updated dependencies [6369956]
  - @milaboratories/pl-model-common@1.38.0
  - @milaboratories/pl-model-middle-layer@1.18.9

## 1.3.7

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

## 1.3.6

### Patch Changes

- @milaboratories/pl-model-common@1.36.2
- @milaboratories/pl-model-middle-layer@1.18.7

## 1.3.5

### Patch Changes

- Updated dependencies [e5596f5]
  - @milaboratories/pl-model-common@1.36.1
  - @milaboratories/pl-model-middle-layer@1.18.6

## 1.3.4

### Patch Changes

- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
  - @milaboratories/pl-model-common@1.36.0
  - @milaboratories/pl-model-middle-layer@1.18.5

## 1.3.3

### Patch Changes

- Updated dependencies [10eec21]
  - @milaboratories/pl-model-common@1.35.0
  - @milaboratories/pl-model-middle-layer@1.18.4

## 1.3.2

### Patch Changes

- Updated dependencies [a2304be]
  - @milaboratories/pl-model-common@1.34.1
  - @milaboratories/pl-model-middle-layer@1.18.3

## 1.3.1

### Patch Changes

- Updated dependencies [8eb112a]
- Updated dependencies [8eb112a]
  - @milaboratories/pl-model-common@1.34.0
  - @milaboratories/pl-model-middle-layer@1.18.2

## 1.3.0

### Minor Changes

- 1411dea: Expose `buildQuery` and `listColumns` on `PFrameSpecDriver`:

  - `buildQuery(input: BuildQueryInput): SpecQueryJoinEntry` — pure
    spec-layer assembler that turns a terminal column plus an ordered
    path of wrapping steps (linker hops, filter joins) into a
    ready-to-compose `SpecQueryJoinEntry`. No frame handle is required
    (wires directly to the top-level export from `pframes-rs-wasm`).
  - `listColumns(handle: SpecFrameHandle): PColumnInfo[]` — enumerates
    every column registered in the spec frame. `hasData` is always
    `false` for spec-only frames.

  Both are also routed through the QuickJS service injector, so block
  models can call `ctx.services.pframeSpec.buildQuery(...)` and
  `ctx.services.pframeSpec.listColumns(handle)`.

  Bumps `@milaboratories/pframes-rs-wasm` to 1.1.26 (corrected V3:
  `buildQuery` at top level, `listColumns` on the frame resource). The
  pool type switches from `PFrameWasmV2` to `PFrameWasmV3`.

### Patch Changes

- Updated dependencies [1411dea]
  - @milaboratories/pl-model-common@1.33.0
  - @milaboratories/pl-model-middle-layer@1.18.1

## 1.2.7

### Patch Changes

- 49485fd: Correct `PFrameWasmV3` shape:

  - Move `buildQuery` from the per-frame interface to the API factory
    (`PFrameWasmAPIV3`). It is pure over its input and does not consult
    frame state, so it should not require a frame instance.
  - Add the missing `listColumns(): PColumnInfo[]` on the per-frame
    interface, mirroring `PFrameReadApi.listColumns` on the data layer.

  `PFrameWasmV2` / `PFrameWasmAPIV2` are kept as legacy shims until the V3
  surface is implemented on the pframes-rs side and `pframes-rs-wasm`
  stops returning V2 from its top-level exports.

  Requires a matching `pframes-rs-wasm` release that exposes `buildQuery`
  as a top-level export and `listColumns` on the frame resource.

- Updated dependencies [49485fd]
  - @milaboratories/pl-model-middle-layer@1.18.0
  - @milaboratories/pl-model-common@1.32.1

## 1.2.6

### Patch Changes

- Updated dependencies [436d4a9]
  - @milaboratories/pl-model-common@1.32.0
  - @milaboratories/pl-model-middle-layer@1.17.0

## 1.2.5

### Patch Changes

- Updated dependencies [9c3b6c2]
  - @milaboratories/pl-model-common@1.31.2
  - @milaboratories/pl-model-middle-layer@1.16.4

## 1.2.4

### Patch Changes

- 5a6ce18: PFrames discoverColumns fix - no more paths with dangling linkers

## 1.2.3

### Patch Changes

- 6dc9e0d: Move browser-safe types (MiLogger, RefCountPoolBase, isDisposable) from ts-helpers to helpers to fix Vite browser bundling error in ui-vue
- Updated dependencies [6dc9e0d]
  - @milaboratories/helpers@1.14.1
  - @milaboratories/pl-model-common@1.31.1
  - @milaboratories/pl-model-middle-layer@1.16.3

## 1.2.2

### Patch Changes

- Updated dependencies [5becf87]
  - @milaboratories/pl-model-common@1.31.0
  - @milaboratories/pl-model-middle-layer@1.16.2

## 1.2.1

### Patch Changes

- e44b64c: PFrames update

## 1.2.0

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

## 1.1.0

### Minor Changes

- cfee265: Drop V1 DiscoverColumnsRequest/PFrameWasm/PFrameWasmAPI, adopt V2 interfaces; update DiscoverColumnsRequest in common with includeColumns/excludeColumns/maxHops fields; extract SpecDriver into @milaboratories/pf-spec-driver package; rename specFrameDispose to disposeSpecFrame for API consistency

### Patch Changes

- Updated dependencies [cfee265]
  - @milaboratories/pl-model-common@1.29.0
  - @milaboratories/pl-model-middle-layer@1.16.0
