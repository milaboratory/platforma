import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAnyLogHandle } from "@milaboratories/pl-model-common";
import type { AnyLogHandle } from "@milaboratories/pl-model-common";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";
import { MAX_BATCH_ENTRIES, readBatch, succeededEntry } from "./batch";
import { blockHasNoOutputs, failedEntry, noLogHandles } from "./unreadable";

export function registerLogTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_block_logs",
    {
      description:
        "Read execution logs for several blocks in one call. Returns one entry per requested block id, keyed by id, " +
        `each carrying that block's logs keyed by sample/run ID, or its own error. At most ${MAX_BATCH_ENTRIES} block ids per call.`,
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockIds: z
          .array(z.string())
          .describe(`Block IDs to read — at most ${MAX_BATCH_ENTRIES} per call, each named once`),
        lines: z.number().optional().default(100).describe("Number of lines per log (default 100)"),
        sampleId: z
          .string()
          .optional()
          .describe("Specific sample/key to read logs for (reads all if omitted)"),
      },
    },
    async ({ projectId, blockIds, lines, sampleId }) => {
      const project = await ctx.getOpenedProject(projectId);
      const logDriver = ctx.requireMl().driverKit.logDriver;

      return readBatch(blockIds, async (blockId) => {
        const state = await project.getBlockState(blockId).getValue();
        if (!state?.outputs) return failedEntry(blockHasNoOutputs());

        const outputs = state.outputs as Record<
          string,
          { ok?: boolean; value?: { data?: { key: string[]; value: unknown }[] } }
        >;
        const logEntries: { outputKey: string; key: string[]; handle: AnyLogHandle }[] = [];
        for (const [outputKey, output] of Object.entries(outputs)) {
          if (!output?.ok || !output.value?.data) continue;
          for (const entry of output.value.data) {
            if (isAnyLogHandle(entry.value)) {
              logEntries.push({ outputKey, key: entry.key, handle: entry.value });
            }
          }
        }
        if (logEntries.length === 0) return failedEntry(noLogHandles());

        const results: Record<string, string> = {};
        for (const entry of logEntries) {
          const key = entry.key.join("/");
          if (sampleId && !entry.key.includes(sampleId)) continue;
          try {
            const response = await logDriver.lastLines(entry.handle, lines);
            if (response.shouldUpdateHandle) {
              results[key] = "[log handle stale — block may still be running, retry later]";
            } else {
              results[key] = new TextDecoder().decode(response.data);
            }
          } catch (err) {
            results[key] = `Error reading log: ${err}`;
          }
        }
        return succeededEntry(results);
      });
    },
  );

  server.registerTool(
    "get_app_log",
    {
      description: "Read recent lines from the application log. Useful for debugging errors.",
      inputSchema: {
        lines: z.number().optional().default(50).describe("Number of lines to return (default 50)"),
        search: z.string().optional().describe("Filter lines containing this substring"),
      },
    },
    async ({ lines, search }) => {
      if (!ctx.callbacks.readAppLog) {
        return errorResult(
          "App log reading is not available.",
          "This feature requires the desktop app integration.",
        );
      }
      const log = await ctx.callbacks.readAppLog(lines, search);
      return textResult({ log });
    },
  );
}
