import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";

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
        return errorResult(
          "Connection management is not available.",
          "The desktop app integration may not support this feature.",
        );
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
        return errorResult(
          "Failed to connect to Platforma Server.",
          "Check that provided URL is available and accepts connecitons.",
        );
      }
      return textResult(await ctx.callbacks.connectToServer(addr, login, password));
    },
  );

  server.registerTool("disconnect", { description: "Disconnect from current server" }, async () => {
    if (!ctx.callbacks.disconnect) {
      return errorResult(
        "Failed to disconnect.",
        "More likely it's because connection is already closed. Could check it with 'get_connection_status' tool.",
      );
    }
    await ctx.callbacks.disconnect();
    return textResult({ ok: true });
  });
}
