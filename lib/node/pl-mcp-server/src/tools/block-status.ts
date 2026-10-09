import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";

export function registerBlockStatusTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_block_status",
    {
      description:
        "Get the block status tree of a block run: one node per template render, each with its data " +
        "(name, block-pack, block-id, resource, root), its status transitions in time order " +
        "(topic, reporting resource, state, detail, reason), its attributes (topic, resource, key, " +
        "value) and its child renders. Use it to see which step a block is in or where it waits. " +
        "Reads the current state; call again to refresh.",
      inputSchema: {
        projectId: z.string().describe("Project ID (must be opened)"),
        blockId: z.string().describe("Block ID"),
        mode: z
          .enum(["prod", "staging"])
          .optional()
          .describe("Which render of the block: 'prod' (default) or 'staging'"),
      },
    },
    async ({ projectId, blockId, mode }) => {
      const project = await ctx.getOpenedProject(projectId);
      const tree = await project.getBlockStatus(blockId, mode ?? "prod");
      if (tree === undefined)
        return errorResult(
          "Block has no status tree: it was not rendered yet, or the backend does not support block status.",
        );
      return textResult(tree);
    },
  );
}
