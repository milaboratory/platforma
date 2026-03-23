import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { textResult } from "./types";

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
      const overview = await project.overview.awaitStableValue();
      return textResult({
        label: overview.meta.label,
        blocks: overview.blocks.map((b: any) => ({
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
      description: "Get the current state/data of a block (its storage and outputs)",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID"),
      },
    },
    async ({ projectId, blockId }) => {
      const project = await ctx.getOpenedProject(projectId);
      const state = await project.getBlockState(blockId).awaitStableValue();
      let data: unknown = undefined;
      if (state.blockStorage) {
        try {
          const parsed =
            typeof state.blockStorage === "string"
              ? JSON.parse(state.blockStorage)
              : state.blockStorage;
          data = parsed?.__data;
        } catch {
          data = undefined;
        }
      }
      return textResult({
        data,
        outputs: state.outputs,
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
      await project.mutateBlockStorage(blockId, {
        operation: "update-block-data",
        value: data,
      });
      return textResult({ ok: true });
    },
  );
}
