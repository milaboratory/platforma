---
"@milaboratories/pl-tree": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-mcp-server": minor
---

Summarize what a block run is doing. The block overview carries `actionSummary`, read from the synchronized project tree and updated as controllers report: a phase (Failed, Running, Waiting, Done, NotStarted), the resources that work or wait with their state, readings and the time they entered the state, the failed resources with the reason, and counts per state. `Project.getBlockActionSummary(blockId, mode)` returns the same summary, and the MCP server exposes it as the `get_block_action_summary` tool. Tree node accessors list key-values with `listKeyValuesAsString()`.
