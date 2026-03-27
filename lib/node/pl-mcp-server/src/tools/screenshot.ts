import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult } from "./types";

export function registerScreenshotTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "capture_screenshot",
    {
      description:
        "Capture a screenshot of the current application window. Optionally save to a file.",
      inputSchema: {
        savePath: z
          .string()
          .optional()
          .describe(
            "Absolute file path to save the screenshot as PNG. If omitted, returns the image inline only.",
          ),
      },
    },
    async ({ savePath }: { savePath?: string }) => {
      if (!ctx.callbacks.captureScreenshot) {
        return errorResult(
          "Screenshot capture is not available.",
          "Make sure the MCP server is running inside Platforma Desktop and MCP connected properly. If everything is fine check Electron logs with get_app_log",
        );
      }
      const base64Png = await ctx.callbacks.captureScreenshot();

      if (savePath) {
        const absPath = resolve(savePath);
        await writeFile(absPath, Buffer.from(base64Png, "base64"));
        return {
          content: [
            { type: "image" as const, data: base64Png, mimeType: "image/png" },
            { type: "text" as const, text: `Screenshot saved to ${absPath}` },
          ],
        };
      }

      return {
        content: [{ type: "image" as const, data: base64Png, mimeType: "image/png" }],
      };
    },
  );
}
