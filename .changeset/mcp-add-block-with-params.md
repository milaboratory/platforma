---
"@milaboratories/pl-mcp-server": minor
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-errors": minor
---

MCP: create a block from initialization params.

- `add_block` takes `params` (the initialization params of the block's kind), `blockIds` (ids used inside the params mapped to block ids of the project) and `before`, and accepts a block kind reference as `spec`. It adds only blocks on the current block API; a refused block creates nothing.
- New tool `get_block_params` returns a block's configuration as its kind's initialization params.
- `open_project` takes `activate`; `PlMcpServerCallbacks.onProjectOpened` receives it as its second argument.
- `Project.addBlock` takes `AddBlockOps` (`init`, `requireModelAPIVersion`); new `Project.getBlockInitializationParams`.
- New error `BlockInitParamsRejectedError`.
