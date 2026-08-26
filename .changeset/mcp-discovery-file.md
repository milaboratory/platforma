---
"@milaboratories/pl-mcp-server": minor
---

Publish the live server address to a discovery file. `PlMcpServerOptions.discoveryFilePath` makes the server write `{ "url": ... }` once the listener has bound — so the address carries the port actually bound, not the one requested — and remove the file when it stops. The write is atomic and owner-only, because the address carries the MCP secret. With no path supplied the server publishes nothing. `DiscoveryFile` and `mcpDiscoveryFilePath` are exported so a reader computes the same path rather than hardcoding it.
