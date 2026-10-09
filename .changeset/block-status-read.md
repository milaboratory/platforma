---
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-mcp-server": minor
---

Read the block status tree. `Project.getBlockStatus(blockId, mode)` returns the status context of a block render with its data, transitions, attributes and child renders, read in one transaction. The MCP server exposes it as the `get_block_status` tool.
