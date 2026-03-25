import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, summarizeOutputs, textResult } from "./types";

export function registerAwaitTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "await_block_done",
    {
      description:
        "Wait for a block to finish computation and outputs to stabilize. Returns block status and data on completion, or timeout info." +
        "Output contains `sizeEstimate` and `totalSizeEstimate` fields, that contain raw estimation in tokens. Try not to pull big data to not pollute context.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID to wait for"),
        timeout: z.number().optional().default(120000).describe("Timeout in ms (default 120000)"),
      },
    },
    async ({ projectId, blockId, timeout }) => {
      const project = await ctx.getOpenedProject(projectId);
      const deadline = Date.now() + timeout;

      // Phase 1: poll overview until calculationStatus is Done or error
      while (Date.now() < deadline) {
        const overview = await project.overview.awaitStableValue();
        const block = overview.blocks.find((b: any) => b.id === blockId);
        if (!block)
          return errorResult(
            `Block ${blockId} not found in project ${projectId}.`,
            "Use get_project_overview to list all block IDs in this project.",
          );

        if (block.calculationStatus === "Done") {
          // Phase 2: await stable block state
          try {
            const state = await project
              .getBlockState(blockId)
              .awaitStableValue(AbortSignal.timeout(Math.max(deadline - Date.now(), 1000)));
            let data: unknown;
            if (state.blockStorage) {
              try {
                const parsed =
                  typeof state.blockStorage === "string"
                    ? JSON.parse(state.blockStorage)
                    : state.blockStorage;
                data = parsed?.__data;
              } catch {
                data = state.blockStorage;
              }
            }
            const outputSummary = summarizeOutputs(
              state.outputs as Record<string, unknown> | undefined,
            );
            return textResult({
              status: "Done",
              block: {
                id: block.id,
                title: block.title ?? block.label,
                calculationStatus: block.calculationStatus,
                canRun: block.canRun,
                stale: block.stale,
                outputErrors: block.outputErrors,
              },
              data,
              outputs: outputSummary,
            });
          } catch {
            return textResult({
              timedOut: true,
              status: "Done",
              note: "Computation done but outputs did not stabilize in time",
            });
          }
        }

        if (block.calculationStatus === "Limbo") {
          return textResult({
            status: "Limbo",
            error: "Block entered Limbo state (upstream failed or was stopped)",
          });
        }

        // Still running — wait up to 5s for overview to change, then re-poll
        try {
          const result = await project.overview.getFullValue();
          await project.overview.awaitChange(AbortSignal.timeout(5000), result.uTag);
        } catch {
          // timeout or abort — just re-poll
        }
      }

      // Timed out
      const overview = await project.overview.awaitStableValue();
      const block = overview.blocks.find((b: any) => b.id === blockId);
      return textResult({
        timedOut: true,
        status: block?.calculationStatus ?? "Unknown",
      });
    },
  );
}
