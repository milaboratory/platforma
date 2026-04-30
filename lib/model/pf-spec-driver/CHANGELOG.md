# @milaboratories/pf-spec-driver

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
