import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { textResult } from "./types";

export function registerLogTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_block_logs",
    {
      description:
        "Read execution logs for a block. Extracts log handles from block outputs and reads log content. Returns logs keyed by sample/run ID.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID"),
        lines: z
          .number()
          .optional()
          .default(100)
          .describe("Number of lines per log (default 100)"),
        sampleId: z
          .string()
          .optional()
          .describe("Specific sample/key to read logs for (reads all if omitted)"),
      },
    },
    async ({ projectId, blockId, lines, sampleId }) => {
      const project = await ctx.getOpenedProject(projectId);
      const state = await project.getBlockState(blockId).awaitStableValue();
      if (!state.outputs) return textResult({ error: "Block has no outputs" });

      // Find log handles in outputs — look for the "logs" output
      const logsOutput = (state.outputs as Record<string, unknown>)?.["logs"] as
        | { ok: boolean; value?: { data?: { key: string[]; value: string }[] } }
        | undefined;
      if (!logsOutput?.ok || !logsOutput.value?.data) {
        return textResult({ error: "No log handles found in block outputs" });
      }

      const logEntries = logsOutput.value.data;
      const logDriver = ctx.requireMl().driverKit.logDriver;
      const results: Record<string, string> = {};

      for (const entry of logEntries) {
        const key = entry.key.join("/");
        if (sampleId && !entry.key.includes(sampleId)) continue;
        const handle = entry.value as `log+ready://log/${string}` | `log+live://log/${string}`;
        try {
          const response = await logDriver.lastLines(handle, lines);
          if (!response.shouldUpdateHandle) {
            results[key] = new TextDecoder().decode(response.data);
          }
        } catch (err) {
          results[key] = `Error reading log: ${err}`;
        }
      }

      return textResult(results);
    },
  );

  server.registerTool(
    "get_app_log",
    {
      description: "Read recent lines from the application log. Useful for debugging errors.",
      inputSchema: {
        lines: z
          .number()
          .optional()
          .default(50)
          .describe("Number of lines to return (default 50)"),
        search: z.string().optional().describe("Filter lines containing this substring"),
      },
    },
    async ({ lines, search }) => {
      if (!ctx.callbacks.readAppLog) {
        return textResult({ error: "App log not available" });
      }
      const log = await ctx.callbacks.readAppLog(lines, search);
      return textResult({ log });
    },
  );
}
