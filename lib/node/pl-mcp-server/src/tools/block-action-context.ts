import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";

export function registerBlockActionContextTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_block_action_context",
    {
      description:
        "Get the block action context tree of a block run: one node per template render, each with its baggage " +
        "(name, block-pack, block-id, resource, root), its action transition in time order " +
        "(namespace, reporting resource, state, detail, reason), its readings (namespace, resource, key, " +
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
      const tree = await project.getBlockActionContext(blockId, mode ?? "prod");
      if (tree === undefined)
        return errorResult(
          "Block has no action context tree: it was not rendered yet, or the backend does not support block action context.",
        );
      return textResult(tree);
    },
  );
}
