---
"@milaboratories/pl-mcp-server": patch
---

Ship a Claude plugin that finds the running server itself. It lives at `claude-plugin/` beside the server and declares one MCP server, `pl`, whose entry is a dependency-free Node launcher: on start it reads the address the app published to the discovery file and bridges the client's stdio to it. Installing the plugin is the whole setup — no address is copied, and a server that rebound to another port or regenerated its secret is still reached, because the address is resolved at every start rather than baked in at install.
