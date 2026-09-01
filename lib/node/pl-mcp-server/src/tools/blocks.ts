import type { McpServer } from "@modelcontextprotocol/server";
import type { BlockPackSpecAny } from "@milaboratories/pl-middle-layer";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as v from "valibot";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";

export function registerBlockTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "add_block",
    {
      description:
        "Add a block to an opened project. Spec can be from-registry-v2 (for published blocks) or dev-v2 (for local dev blocks).",
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(v.string(), v.description("Project ID (must be opened)")),
          label: v.pipe(v.string(), v.description("Block label")),
          spec: v.pipe(
            v.union([
              v.object({
                type: v.literal("from-registry-v2"),
                registryUrl: v.pipe(v.string(), v.description("Registry URL")),
                id: v.object({
                  organization: v.string(),
                  name: v.string(),
                  version: v.string(),
                }),
              }),
              v.object({
                type: v.literal("dev-v2"),
                folder: v.pipe(v.string(), v.description("Path to block folder")),
              }),
            ]),
            v.description("Block pack specification"),
          ),
        }),
      ),
    },
    async ({ projectId, label, spec }) => {
      const project = await ctx.getOpenedProject(projectId);
      const blockId = await project.addBlock(
        label,
        spec as BlockPackSpecAny,
        undefined,
        ctx.getAuthorMarker(),
      );
      return textResult({ blockId });
    },
  );

  server.registerTool(
    "update_block",
    {
      description:
        "Update an existing block's pack (reload from registry or dev folder). Use after rebuilding a dev block to pick up changes without removing/re-adding it.",
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(v.string(), v.description("Project ID (must be opened)")),
          blockId: v.pipe(v.string(), v.description("Block ID to update")),
          spec: v.pipe(
            v.union([
              v.object({
                type: v.literal("from-registry-v2"),
                registryUrl: v.pipe(v.string(), v.description("Registry URL")),
                id: v.object({
                  organization: v.string(),
                  name: v.string(),
                  version: v.string(),
                }),
              }),
              v.object({
                type: v.literal("dev-v2"),
                folder: v.pipe(v.string(), v.description("Path to block folder")),
              }),
            ]),
            v.description("Block pack specification"),
          ),
          resetArgs: v.optional(
            v.pipe(
              v.boolean(),
              v.description("Reset block arguments to initial values (default: false)"),
            ),
          ),
        }),
      ),
    },
    async ({ projectId, blockId, spec, resetArgs }) => {
      const project = await ctx.getOpenedProject(projectId);
      await project.updateBlockPack(
        blockId,
        spec as BlockPackSpecAny,
        resetArgs ?? false,
        ctx.getAuthorMarker(),
      );
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "remove_block",
    {
      description: "Remove a block from an opened project",
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(v.string(), v.description("Project ID")),
          blockId: v.pipe(v.string(), v.description("Block ID to remove")),
        }),
      ),
    },
    async ({ projectId, blockId }) => {
      const project = await ctx.getOpenedProject(projectId);
      await project.deleteBlock(blockId, ctx.getAuthorMarker());
      return textResult({ ok: true });
    },
  );

  server.registerTool(
    "run_block",
    {
      description: "Run a block. Stale upstream blocks are started automatically.",
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(v.string(), v.description("Project ID")),
          blockId: v.pipe(v.string(), v.description("Block ID to run")),
        }),
      ),
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
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(v.string(), v.description("Project ID")),
          blockId: v.pipe(v.string(), v.description("Block ID to stop")),
        }),
      ),
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
      description: "Reorder blocks in a project. Must provide ALL block IDs in the desired order.",
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(v.string(), v.description("Project ID")),
          blockIds: v.pipe(
            v.array(v.string()),
            v.description("All block IDs in the desired order"),
          ),
        }),
      ),
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
      inputSchema: toStandardJsonSchema(
        v.object({
          query: v.optional(
            v.pipe(
              v.string(),
              v.description("Filter blocks by name (case-insensitive substring match)"),
            ),
          ),
        }),
      ),
    },
    async ({ query }) => {
      if (!ctx.callbacks.listAvailableBlocks) {
        return errorResult(
          "Block registry is not available.",
          "This usually means the desktop app encounters a problem connecting block registry. Check Settings > Override Main Registry find which registry really in use and check connection.",
        );
      }
      const blocks = await ctx.callbacks.listAvailableBlocks(query);
      return textResult(blocks);
    },
  );

  server.registerTool(
    "get_block_info",
    {
      description:
        "Get detailed info about a specific block package from the registry. Use list_available_blocks first to find the block.",
      inputSchema: toStandardJsonSchema(
        v.object({
          registryUrl: v.pipe(
            v.string(),
            v.description("Registry URL (from list_available_blocks)"),
          ),
          organization: v.pipe(v.string(), v.description("Organization name")),
          name: v.pipe(v.string(), v.description("Block package name")),
          version: v.pipe(v.string(), v.description("Block version")),
        }),
      ),
    },
    async ({ registryUrl, organization, name, version }) => {
      if (!ctx.callbacks.getBlockInfo) {
        return errorResult(
          "Block info is not available in this environment.",
          'Maybe the name of the block was written incerrectly. Use list_available_blocks to browse blocks instead. Or ask user to check "Additional Registries" in Settings panel',
        );
      }
      const info = await ctx.callbacks.getBlockInfo(registryUrl, organization, name, version);
      return textResult(info);
    },
  );

  server.registerTool(
    "select_block",
    {
      description: "Navigate the desktop UI to show a specific block's interface",
      inputSchema: toStandardJsonSchema(
        v.object({
          projectId: v.pipe(v.string(), v.description("Project ID")),
          blockId: v.pipe(v.string(), v.description("Block ID to display")),
        }),
      ),
    },
    async ({ projectId, blockId }) => {
      if (!ctx.callbacks.selectBlock) {
        return errorResult(
          "Failed to select the block.",
          "This feature requires server connected and open project. Use get_connection_status and list_projects to check. If there are no connection, use list_connections and ask user which should be used.",
        );
      }
      await ctx.callbacks.selectBlock(projectId, blockId);
      return textResult({ ok: true });
    },
  );
}
