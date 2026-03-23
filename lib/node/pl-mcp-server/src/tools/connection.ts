import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { textResult } from "./types";

export function registerConnectionTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_connection_status",
    { description: "Get current server connection status" },
    async () => {
      if (!ctx.callbacks.getConnectionStatus) {
        return textResult({ connected: !!ctx.getMl() });
      }
      return textResult(await ctx.callbacks.getConnectionStatus());
    },
  );

  server.registerTool(
    "list_connections",
    { description: "List saved server connections" },
    async () => {
      if (!ctx.callbacks.listConnections) {
        return textResult({ error: "Connection management not available" });
      }
      return textResult(await ctx.callbacks.listConnections());
    },
  );

  server.registerTool(
    "connect_to_server",
    {
      description: "Connect to a Platforma server. Use list_connections to see saved servers.",
      inputSchema: {
        addr: z.string().describe("Server address (e.g. https://pl6.demo2.platforma.bio:6346)"),
        login: z.string().describe("Username"),
        password: z.string().optional().describe("Password (uses saved token if omitted)"),
      },
    },
    async ({ addr, login, password }) => {
      if (!ctx.callbacks.connectToServer) {
        return textResult({ error: "Connection management not available" });
      }
      return textResult(await ctx.callbacks.connectToServer(addr, login, password));
    },
  );

  server.registerTool(
    "disconnect",
    { description: "Disconnect from current server" },
    async () => {
      if (!ctx.callbacks.disconnect) {
        return textResult({ error: "Connection management not available" });
      }
      await ctx.callbacks.disconnect();
      return textResult({ ok: true });
    },
  );
}
