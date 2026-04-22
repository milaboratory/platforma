# @milaboratories/pl-mcp-server

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
