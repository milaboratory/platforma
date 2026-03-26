import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, safeEval, summarizeOutputs, textResult } from "./types";

export function registerAwaitTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "await_block_done",
    {
      description:
        "Wait for a block to finish computation and outputs to stabilize. " +
        "Returns block status, data, and concise output summary with token estimates. " +
        "Use `transform` to extract specific data server-side on completion.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID to wait for"),
        timeout: z.number().optional().default(120000).describe("Timeout in ms (default 120000)"),
        transform: z
          .string()
          .optional()
          .describe(
            "JS expression evaluated server-side when block completes. " +
            "Available variables: `data` (block args), `outputs` (raw outputs), `block` (status info). " +
            "Omit for default concise summary.",
          ),
        transformTimeout: z
          .number()
          .optional()
          .default(5000)
          .describe("Timeout in ms for transform evaluation (default 5000)."),
      },
    },
    async ({ projectId, blockId, timeout, transform, transformTimeout }) => {
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
            const blockInfo = {
              id: block.id,
              title: block.title ?? block.label,
              calculationStatus: block.calculationStatus,
              canRun: block.canRun,
              stale: block.stale,
              outputErrors: block.outputErrors,
            };
            if (transform) {
              try {
                const result = safeEval(transform, {
                  data,
                  outputs: state.outputs,
                  block: blockInfo,
                }, transformTimeout);
                return textResult({ status: "Done", block: blockInfo, result });
              } catch (e: unknown) {
                return errorResult(
                  `Transform failed: ${e instanceof Error ? e.message : String(e)}`,
                  "Check your JS expression syntax. Available variables: data, outputs, block.",
                );
              }
            }
            return textResult({
              status: "Done",
              block: blockInfo,
              data,
              outputs: summarizeOutputs(state.outputs as Record<string, unknown> | undefined),
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
