import type { McpServer } from "@modelcontextprotocol/server";
import { isAnyLogHandle } from "@milaboratories/pl-model-common";
import type { AnyLogHandle } from "@milaboratories/pl-model-common";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";

export function registerLogTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_block_logs",
    {
      description:
        "Read execution logs for a block. Extracts log handles from block outputs and reads log content. Returns logs keyed by sample/run ID.",
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(v.string(), v.description("Project ID")),
          blockId: v.pipe(v.string(), v.description("Block ID")),
          lines: v.optional(
            v.pipe(v.number(), v.description("Number of lines per log (default 100)")),
            100,
          ),
          sampleId: v.optional(
            v.pipe(
              v.string(),
              v.description("Specific sample/key to read logs for (reads all if omitted)"),
            ),
          ),
        }),
      ),
    },
    async ({ projectId, blockId, lines, sampleId }) => {
      const project = await ctx.getOpenedProject(projectId);
      const state = await project.getBlockState(blockId).getValue();
      if (!state.outputs)
        return errorResult(
          "Block has no outputs yet.",
          "The block may not have been run. Use get_project_overview to check its calculationStatus, then run_block if needed.",
        );

      // Scan all outputs for log handles (log+ready:// or log+live://)
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

      if (logEntries.length === 0) {
        return errorResult(
          "No log handles found in block outputs.",
          "This block may not produce logs, or it hasn't run yet. Use get_block_outputs to inspect available output types.",
        );
      }

      const logDriver = ctx.requireMl().driverKit.logDriver;
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

      return textResult(results);
    },
  );

  server.registerTool(
    "get_app_log",
    {
      description: "Read recent lines from the application log. Useful for debugging errors.",
      inputSchema: toStandardJsonSchema(
        v.object({
          lines: v.optional(
            v.pipe(v.number(), v.description("Number of lines to return (default 50)")),
            50,
          ),
          search: v.optional(
            v.pipe(v.string(), v.description("Filter lines containing this substring")),
          ),
        }),
      ),
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
