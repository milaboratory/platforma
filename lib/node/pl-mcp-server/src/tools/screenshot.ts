import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";

export function registerScreenshotTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "capture_screenshot",
    { description: "Capture a screenshot of the current application window" },
    async () => {
      if (!ctx.callbacks.captureScreenshot) {
        return errorResult("Screenshot capture is not available.", "Make sure the MCP server is running inside Platforma Desktop and MCP connected properly. If everything is fine check Electron logs with get_app_log");
      }
      const base64Png = await ctx.callbacks.captureScreenshot();
      return {
        content: [{ type: "image" as const, data: base64Png, mimeType: "image/png" }],
      };
    },
  );
}
