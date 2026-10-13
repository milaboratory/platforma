---
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-mcp-server": minor
---

Read the block action context tree. `Project.getBlockActionContext(blockId, mode)` returns the action context of a block render with its baggage, transitions, readings and child renders, read in one transaction. The MCP server exposes it as the `get_block_action_context` tool, cut to `maxDepth` levels and the latest `maxTransitions` per node, with `contextId` to read a subtree.
