import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";

export function registerUIInteractionTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "click",
    {
      description:
        "Click at coordinates (x, y) in the application window. Use capture_screenshot to find element positions.",
      inputSchema: {
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
        doubleClick: z.boolean().optional().describe("Double click"),
      },
    },
    async ({ x, y, doubleClick }) => {
      if (!ctx.callbacks.sendInputEvent) {
        return errorResult(
          "UI interaction is not available.",
          "Make sure the MCP server is running inside Platforma Desktop and MCP connected properly. If everything is fine check Electron logs with get_app_log",
        );
      }
      const clickCount = doubleClick ? 2 : 1;
      await ctx.callbacks.sendInputEvent({
        type: "mouseDown",
        x,
        y,
        button: "left",
        clickCount,
      });
      await ctx.callbacks.sendInputEvent({ type: "mouseUp", x, y, button: "left", clickCount });
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "type_text",
    {
      description: "Type text into the currently focused element",
      inputSchema: {
        text: z.string().describe("Text to type"),
      },
    },
    async ({ text }) => {
      if (!ctx.callbacks.sendInputEvent) {
        return errorResult(
          "UI interaction is not available.",
          "Make sure the MCP server is running inside Platforma Desktop and MCP connected properly. If everything is fine check Electron logs with get_app_log",
        );
      }
      for (const char of text) {
        await ctx.callbacks.sendInputEvent({ type: "keyDown", keyCode: char });
        await ctx.callbacks.sendInputEvent({ type: "char", keyCode: char });
        await ctx.callbacks.sendInputEvent({ type: "keyUp", keyCode: char });
      }
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "press_key",
    {
      description: "Press a keyboard key (Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp, etc.)",
      inputSchema: {
        key: z
          .string()
          .describe("Key name (e.g. 'Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown')"),
        modifiers: z
          .array(z.enum(["shift", "control", "alt", "meta"]))
          .optional()
          .describe("Modifier keys to hold"),
      },
    },
    async ({ key, modifiers }) => {
      if (!ctx.callbacks.sendInputEvent) {
        return errorResult(
          "UI interaction is not available.",
          "Make sure the MCP server is running inside Platforma Desktop and MCP connected properly. If everything is fine check Electron logs with get_app_log",
        );
      }
      await ctx.callbacks.sendInputEvent({
        type: "keyDown",
        keyCode: key,
        ...(modifiers && {
          shift: modifiers.includes("shift"),
          control: modifiers.includes("control"),
          alt: modifiers.includes("alt"),
          meta: modifiers.includes("meta"),
        }),
      });
      await ctx.callbacks.sendInputEvent({
        type: "keyUp",
        keyCode: key,
        ...(modifiers && {
          shift: modifiers.includes("shift"),
          control: modifiers.includes("control"),
          alt: modifiers.includes("alt"),
          meta: modifiers.includes("meta"),
        }),
      });
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "scroll",
    {
      description: "Scroll the page at a given position",
      inputSchema: {
        x: z.number().describe("X coordinate to scroll at"),
        y: z.number().describe("Y coordinate to scroll at"),
        deltaX: z.number().optional().default(0).describe("Horizontal scroll amount"),
        deltaY: z.number().describe("Vertical scroll amount (negative = up, positive = down)"),
      },
    },
    async ({ x, y, deltaX, deltaY }) => {
      if (!ctx.callbacks.sendInputEvent) {
        return errorResult(
          "UI interaction is not available.",
          "Make sure the MCP server is running inside Platforma Desktop and MCP connected properly. If everything is fine check Electron logs with get_app_log",
        );
      }
      await ctx.callbacks.sendInputEvent({
        type: "mouseWheel",
        x,
        y,
        deltaX: deltaX ?? 0,
        deltaY,
      });
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "execute_js",
    {
      description:
        "Execute JavaScript in a renderer and return the result. By default runs in the topmost webContents (main app / topmost modal). Pass projectId + blockId to run inside that block's webview, where `window.platforma` is exposed and the driverKit (e.g. `window.platforma.lsDriver.getLocalFileHandle`) is callable. The block must already be open — call `select_block` first if needed.",
      inputSchema: {
        code: z.string().describe("JavaScript code to execute"),
        projectId: z
          .string()
          .optional()
          .describe("Target project ID. Must be paired with blockId."),
        blockId: z
          .string()
          .optional()
          .describe(
            "Target block ID. When provided with projectId, JS runs in that block's webview (where `window.platforma` is available).",
          ),
      },
    },
    async ({ code, projectId, blockId }) => {
      if (!ctx.callbacks.executeJavaScript) {
        return errorResult(
          "JS execution is not available.",
          "Make sure the MCP server is running inside Platforma Desktop and MCP connected properly. If everything is fine check Electron logs with get_app_log",
        );
      }
      if ((projectId === undefined) !== (blockId === undefined)) {
        return errorResult(
          "projectId and blockId must be provided together.",
          "Either pass both to target a specific block's webview, or pass neither to run in the topmost webContents.",
        );
      }
      const target =
        projectId !== undefined && blockId !== undefined ? { projectId, blockId } : undefined;
      const result = await ctx.callbacks.executeJavaScript(code, target);
      return textResult(result);
    },
  );
}
