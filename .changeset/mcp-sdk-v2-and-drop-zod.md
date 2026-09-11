---
"@milaboratories/pl-mcp-server": major
---

Move to MCP TypeScript SDK v2, and replace zod with valibot

The monolithic `@modelcontextprotocol/sdk` is replaced by
`@modelcontextprotocol/server` and `@modelcontextprotocol/node` at 2.0.0. Tool
schemas are valibot, wrapped in `toStandardJsonSchema` from
`@valibot/to-json-schema` so the SDK can advertise them in `tools/list`.

Every tool name, description, argument, default and handler is unchanged. A live
`tools/list` advertises the same 77 argument descriptions and 11 defaults as
before.

The negotiated protocol revision stays 2025-11-25. `McpServer` with
`NodeStreamableHTTPServerTransport` cannot select a 2026-era revision; that needs
`createMcpHandler`.

This removes the last zod dependency in the monorepo, so `zod` leaves the
`pnpm-workspace.yaml` catalog. zod remains in `node_modules` as a dependency of
`@modelcontextprotocol/server`.
