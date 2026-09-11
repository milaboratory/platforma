import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolContext } from "./types";
import { textResult } from "./types";

export function registerPingTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool("ping", { description: "Health check" }, async () => {
    return textResult({ status: "ok", connected: !!ctx.getMl() });
  });
}
