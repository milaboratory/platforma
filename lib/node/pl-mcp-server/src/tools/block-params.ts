import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { textResult } from "./types";

export function registerBlockParamsTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_block_params",
    {
      description:
        "Get a block's configuration as the initialization params of its kind: what a project " +
        "template stores for this block. The block's own model derives them from its current data. " +
        "Pass the result as `params` of add_block, with a block of the same kind, to create a " +
        "block configured the same way. Read-only: params usually leave out view state, so to " +
        "change an existing block use get_block_state and set_block_data.\n\n" +
        "Returns `{ kind, params }`. `kind` is absent for a block that declares none.",
      inputSchema: {
        projectId: z.string().describe("Project ID (must be opened)"),
        blockId: z.string().describe("Block ID"),
      },
    },
    async ({ projectId, blockId }) => {
      const project = await ctx.getOpenedProject(projectId);
      return textResult(await project.getBlockInitializationParams(blockId));
    },
  );
}
