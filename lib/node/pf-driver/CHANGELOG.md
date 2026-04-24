# @milaboratories/pf-driver

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
