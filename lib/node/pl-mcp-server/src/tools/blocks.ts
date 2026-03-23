import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BlockPackSpecAny } from "@milaboratories/pl-middle-layer";
import { z } from "zod";
import type { ToolContext } from "./types";
import { textResult } from "./types";

export function registerBlockTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "add_block",
    {
      description:
        "Add a block to an opened project. Spec can be from-registry-v2 (for published blocks) or dev-v2 (for local dev blocks).",
      inputSchema: {
        projectId: z.string().describe("Project ID (must be opened)"),
        label: z.string().describe("Block label"),
        spec: z
          .union([
            z.object({
              type: z.literal("from-registry-v2"),
              registryUrl: z.string().describe("Registry URL"),
              id: z.object({
                organization: z.string(),
                name: z.string(),
                version: z.string(),
              }),
            }),
            z.object({
              type: z.literal("dev-v2"),
              folder: z.string().describe("Path to block folder"),
            }),
          ])
          .describe("Block pack specification"),
      },
    },
    async ({ projectId, label, spec }) => {
      const project = await ctx.getOpenedProject(projectId);
      const blockId = await project.addBlock(label, spec as BlockPackSpecAny);
      return textResult({ blockId });
    },
  );

  server.registerTool(
    "remove_block",
    {
      description: "Remove a block from an opened project",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID to remove"),
      },
    },
    async ({ projectId, blockId }) => {
      const project = await ctx.getOpenedProject(projectId);
      await project.deleteBlock(blockId);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "run_block",
    {
      description: "Run a block. Stale upstream blocks are started automatically.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID to run"),
      },
    },
    async ({ projectId, blockId }) => {
      const project = await ctx.getOpenedProject(projectId);
      await project.runBlock(blockId);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "stop_block",
    {
      description: "Stop a running block",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID to stop"),
      },
    },
    async ({ projectId, blockId }) => {
      const project = await ctx.getOpenedProject(projectId);
      await project.stopBlock(blockId);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "reorder_blocks",
    {
      description:
        "Reorder blocks in a project. Must provide ALL block IDs in the desired order.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockIds: z
          .array(z.string())
          .describe("All block IDs in the desired order"),
      },
    },
    async ({ projectId, blockIds }) => {
      const project = await ctx.getOpenedProject(projectId);
      await project.reorderBlocks(blockIds);
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "list_available_blocks",
    {
      description:
        "List available blocks from configured registries. Optional query to filter by name.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Filter blocks by name (case-insensitive substring match)"),
      },
    },
    async ({ query }) => {
      if (!ctx.callbacks.listAvailableBlocks) {
        return textResult({ error: "Block registry not available" });
      }
      const blocks = await ctx.callbacks.listAvailableBlocks(query);
      return textResult(blocks);
    },
  );

  server.registerTool(
    "select_block",
    {
      description: "Navigate the desktop UI to show a specific block's interface",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID to display"),
      },
    },
    async ({ projectId, blockId }) => {
      if (!ctx.callbacks.selectBlock) {
        return textResult({ error: "UI navigation not available" });
      }
      await ctx.callbacks.selectBlock(projectId, blockId);
      return textResult({ ok: true });
    },
  );
}
