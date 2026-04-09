import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deriveDataFromStorage } from "@platforma-sdk/model";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, safeEval, summarizeOutputs, textResult } from "./types";

export function registerBlockStateTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_project_overview",
    {
      description:
        "Get project overview with all blocks and their statuses (calculationStatus, canRun, stale, errors, upstreams/downstreams)",
      inputSchema: {
        projectId: z.string().describe("Project ID (must be opened)"),
      },
    },
    async ({ projectId }) => {
      const project = await ctx.getOpenedProject(projectId);
      const overview = await project.overview.getValue();
      if (!overview) return errorResult("Project overview not available yet.");
      return textResult({
        label: overview.meta.label,
        blocks: overview.blocks.map((b) => ({
          id: b.id,
          title: b.title ?? b.label,
          calculationStatus: b.calculationStatus,
          canRun: b.canRun,
          stale: b.stale,
          inputsValid: b.inputsValid,
          outputErrors: b.outputErrors,
          upstreams: b.upstreams,
          downstreams: b.downstreams,
        })),
      });
    },
  );

  server.registerTool(
    "get_block_state",
    {
      description:
        "Get block state. Returns block args (data) and a concise output summary with token estimates by default. " +
        "Use `transform` to extract specific data server-side without loading full outputs into context.\n\n" +
        "Default: returns `{ data, outputs: [{ key, ok, hasValue, tokensEstimate }] }`\n\n" +
        "Transform examples:\n" +
        "- `outputs.logs?.value` — get one specific output value\n" +
        "- `data` — get only block args\n" +
        "- `({ preset: outputs.preset?.value, qc: outputs.qc?.value })` — get specific outputs",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID"),
        transform: z
          .string()
          .optional()
          .describe(
            "JS expression evaluated server-side against full block state. " +
              "Available variables: `data` (block args), `outputs` (raw outputs object). " +
              "Omit for default concise summary.",
          ),
        transformTimeout: z
          .number()
          .optional()
          .default(5000)
          .describe("Timeout in ms for transform evaluation (default 5000)."),
      },
    },
    async ({ projectId, blockId, transform, transformTimeout }) => {
      const project = await ctx.getOpenedProject(projectId);
      const state = await project.getBlockState(blockId).getValue();
      const data = deriveDataFromStorage(state.blockStorage);
      if (transform) {
        try {
          const result = safeEval(transform, { data, outputs: state.outputs }, transformTimeout);
          return textResult(result);
        } catch (e: unknown) {
          return errorResult(
            `Transform failed: ${e instanceof Error ? e.message : String(e)}`,
            "Check your JS expression syntax. Available variables: data, outputs.",
          );
        }
      }
      return textResult({
        data,
        outputs: summarizeOutputs(state.outputs as Record<string, unknown> | undefined),
      });
    },
  );

  server.registerTool(
    "set_block_data",
    {
      description: "Set the user-facing data of a block (triggers args derivation and staging)",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID"),
        data: z.record(z.unknown()).describe("Block data object"),
      },
    },
    async ({ projectId, blockId, data }) => {
      const project = await ctx.getOpenedProject(projectId);
      await project.mutateBlockStorage(
        blockId,
        { operation: "update-block-data", value: data },
        ctx.getAuthorMarker(),
      );
      return textResult({ ok: true });
    },
  );
}
