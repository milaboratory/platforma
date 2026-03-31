# @milaboratories/pf-spec-driver

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
