import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./types";
import { textResult } from "./types";

export function registerScreenshotTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "capture_screenshot",
    { description: "Capture a screenshot of the current application window" },
    async () => {
      if (!ctx.callbacks.captureScreenshot) {
        return textResult({ error: "Screenshot not available (no desktop integration)" });
      }
      const base64Png = await ctx.callbacks.captureScreenshot();
      return {
        content: [{ type: "image" as const, data: base64Png, mimeType: "image/png" }],
      };
    },
  );
}
