# @platforma-sdk/package-builder-lib

## 1.1.0

### Minor Changes

- 8dc85d1: Extract the package-builder build engine into a new library package
  `@platforma-sdk/package-builder-lib` (`lib/node/package-builder-lib`). The engine
  (`Core` orchestrator, schemas, docker/conda builders, storage, archive, sw.json
  rendering) now lives in that library; `pl-pkg` (`@platforma-sdk/package-builder`)
  stays bin-only and depends on it. The `Core` class is intentionally not exported —
  the public surface is `createBuilder()` returning a `Builder` facade — so future
  consumers (e.g. `block-tools software`) wrap the engine rather than absorb its
  internals. No `pl-pkg` behavior change: the full command surface, flags, and
  output are identical.
