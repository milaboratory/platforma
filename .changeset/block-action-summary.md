---
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-mcp-server": minor
---

Summarize what a block run is doing. `Project.getBlockActionSummary(blockId, mode)` rolls the block action context tree up into a phase (Failed, Running, Waiting, Done, NotStarted), the resources that work or wait with their state, readings and time in the state, the failed resources with the reason, and counts per state. The MCP server exposes it as the `get_block_action_summary` tool.
