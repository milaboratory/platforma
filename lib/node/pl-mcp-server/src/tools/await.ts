import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isTimeoutError } from "@milaboratories/pl-middle-layer";
import { deriveDataFromStorage } from "@platforma-sdk/model";
import { z } from "zod";
import type { ToolContext } from "./types";
import { summarizeOutputs } from "./tokens";
import { errorResult, safeEval, textResult } from "./types";

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

      while (Date.now() < deadline) {
        const overview = await project.overview.getValue();
        if (!overview) continue;
        const block = overview.blocks.find((b) => b.id === blockId);
        if (!block)
          return errorResult(
            `Block ${blockId} not found in project ${projectId}.`,
            "Use get_project_overview to list all block IDs in this project.",
          );

        // Terminal error states — return immediately
        if (block.calculationStatus === "Limbo") {
          return errorResult(
            "Block entered Limbo state (upstream failed or was stopped).",
            "Check upstream blocks with get_project_overview. Fix or re-run the failed upstream, then retry.",
          );
        }

        if (block.calculationStatus === "NotCalculated") {
          return errorResult(
            "Block has not been started.",
            "Use run_block to start it first, then call await_block_done.",
          );
        }

        if (block.calculationStatus === "Done") {
          // Await stable block state with remaining time budget
          const remaining = Math.max(deadline - Date.now(), 1000);
          let state;
          try {
            state = await project
              .getBlockState(blockId)
              .awaitStableValue(AbortSignal.timeout(remaining));
          } catch (e: unknown) {
            if (isTimeoutError(e)) {
              return textResult({
                timedOut: true,
                status: "Done",
                note: "Computation done but outputs did not stabilize in time. Retry with a longer timeout.",
              });
            }
            return errorResult(
              `Failed to get block state: ${e instanceof Error ? e.message : String(e)}`,
            );
          }

          const data = deriveDataFromStorage(state.blockStorage);

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
              const result = safeEval(
                transform,
                {
                  data,
                  outputs: state.outputs,
                  block: blockInfo,
                },
                transformTimeout,
              );
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
        }

        // Still running — wait up to 5s for overview to change, then re-poll.
        // Minimum 500ms delay to avoid busy-looping if awaitChange resolves immediately.
        const pollStart = Date.now();
        try {
          const result = await project.overview.getFullValue();
          await project.overview.awaitChange(AbortSignal.timeout(5000), result.uTag);
        } catch {
          // timeout or abort — just re-poll
        }
        const elapsed = Date.now() - pollStart;
        if (elapsed < 500) {
          await new Promise((r) => setTimeout(r, 500 - elapsed));
        }
      }

      // Timed out while running
      const overview = await project.overview.getValue();
      const block = overview?.blocks.find((b) => b.id === blockId);
      return textResult({
        timedOut: true,
        status: block?.calculationStatus ?? "Unknown",
        hint: "The block is still running. Call await_block_done again with a longer timeout.",
      });
    },
  );
}
