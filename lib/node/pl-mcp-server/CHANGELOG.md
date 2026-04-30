# @milaboratories/pl-mcp-server

## 6.0.0

### Patch Changes

- Updated dependencies [a40505e]
  - @platforma-sdk/model@1.70.0
  - @milaboratories/pl-middle-layer@1.56.2

## 5.0.0

### Minor Changes

- d8f985a: Correct show label columns and simplify join for big projects

### Patch Changes

- Updated dependencies [d8f985a]
  - @milaboratories/pl-middle-layer@1.56.0
  - @platforma-sdk/model@1.69.0

## 4.0.0

### Patch Changes

- Updated dependencies [5420fea]
- Updated dependencies [5420fea]
  - @platforma-sdk/model@1.68.0
  - @milaboratories/pl-middle-layer@1.55.22

## 3.0.0

### Patch Changes

- Updated dependencies [10eec21]
  - @platforma-sdk/model@1.67.0
  - @milaboratories/pl-middle-layer@1.55.21

## 2.1.1

### Patch Changes

- 9942557: Publish the `ModelAPIVersionMismatchError` class from `pl-errors`, which was added in #1563 but missed in that PR's changeset. `pl-mcp-server@2.1.0` imports the class (`src/tools/block-state.ts`), so downstream bundling against `pl-errors@1.2.8` (the version pinned by the current release) fails with `MISSING_EXPORT`. Bumping `pl-errors` publishes the class; the `pl-mcp-server` patch bump re-resolves its `workspace:*` dep so the next release pins the fixed `pl-errors`.
  - @milaboratories/pl-middle-layer@1.55.14

## 2.1.0

### Minor Changes

- d6de877: Add optional `projectId` and `blockId` to the `execute_js` MCP tool. When both are provided, the JS runs inside the cached block webview, where `window.platforma` is accessible. Errors with "has no loaded webview" if the block isn't loaded — callers should `select_block` first. Behavior without those args is unchanged.

## 2.0.1

### Patch Changes

- 38cae5b: MCP set_block_data: fallback support legacy v1 model blocks

## 2.0.0

### Patch Changes

- Updated dependencies [92ef20f]
  - @platforma-sdk/model@1.65.0
  - @milaboratories/pl-middle-layer@1.55.9

## 1.0.0

### Patch Changes

- Updated dependencies [559d124]
  - @platforma-sdk/model@1.64.0
  - @milaboratories/pl-middle-layer@1.55.8

## 0.2.0

### Minor Changes

- 9b62f34: MCP server for Platforma Desktop
