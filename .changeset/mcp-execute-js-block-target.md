---
'@milaboratories/pl-mcp-server': minor
---

Add optional `projectId` and `blockId` to the `execute_js` MCP tool. When both are provided, the JS runs inside the cached block webview, where `window.platforma` is accessible. Errors with "has no loaded webview" if the block isn't loaded — callers should `select_block` first. Behavior without those args is unchanged.
