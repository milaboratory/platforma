import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BlockPackSpecAny, Project } from "@milaboratories/pl-middle-layer";
import { BlockKindRef, CentralBlockRegistry } from "@milaboratories/pl-middle-layer";
import {
  BlockInitParamsRejectedError,
  ModelAPIVersionMismatchError,
} from "@milaboratories/pl-errors";
import { BLOCK_STORAGE_FACADE_VERSION, type BlockKindReference } from "@platforma-sdk/model";
import { z } from "zod";
import type { AuthorMarker, ToolContext } from "./types";
import { errorResult, textResult } from "./types";

/** Where a kind is resolved when the caller names no registry. */
function centralBlockRegistryUrl(): string {
  if (CentralBlockRegistry.type !== "remote-v2")
    throw new Error("The central block registry is expected to be a v2 remote registry.");
  return CentralBlockRegistry.url;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const addBlockInput = {
  projectId: z.string().describe("Project ID (must be opened)"),
  label: z.string().describe("Block label"),
  spec: z
    .union([
      z.object({
        type: z.literal("kind"),
        kind: z
          .string()
          .describe(
            'Block kind reference "<package name>@<version or range>", ' +
              'e.g. "@platforma-open/milaboratories.samples-and-data.kind@1.2.0"',
          ),
        registryUrl: z
          .string()
          .optional()
          .describe("Registry to resolve the kind in (default: the central block registry)"),
        allowUnstable: z
          .boolean()
          .optional()
          .describe("Also consider blocks not published to the stable channel"),
      }),
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
    .describe("Which block to add"),
  params: z
    .record(z.unknown())
    .optional()
    .describe("Initialization params of the block's kind. Omit for the default state."),
  blockIds: z
    .record(z.string())
    .optional()
    .describe(
      "Ids used inside `params` in place of block ids, each mapped to a block id of this " +
        "project. Needed only when `params` do not already hold ids of this project.",
    ),
  before: z
    .string()
    .optional()
    .describe("ID of the block to insert the new block before (default: add at the end)"),
};

/** Input of the `add_block` tool. */
export type AddBlockInput = z.infer<z.ZodObject<typeof addBlockInput>>;

/** What `add_block` needs from the application. */
export type AddBlockDeps = {
  project: Pick<Project, "addBlock">;
  /** Resolves a kind reference to the block implementing it; throws when there is none. */
  resolveKind: (
    kind: BlockKindReference,
    registryUrl: string | undefined,
    allowUnstable: boolean,
  ) => Promise<BlockPackSpecAny>;
  author: AuthorMarker;
};

/**
 * Adds the block the input describes, started from its params when it carries them. Every way the
 * block can be refused comes back as an error result saying nothing was created.
 */
export async function addBlock(deps: AddBlockDeps, input: AddBlockInput) {
  const { label, spec, params, blockIds, before } = input;

  let blockPackSpec: BlockPackSpecAny;
  if (spec.type === "kind") {
    try {
      blockPackSpec = await deps.resolveKind(
        BlockKindRef.parse(spec.kind),
        spec.registryUrl,
        spec.allowUnstable ?? false,
      );
    } catch (e: unknown) {
      return errorResult(
        `Kind "${spec.kind}" was not resolved to a block: ${errorMessage(e)}. Nothing was created.`,
        "Check the kind name and version. Pass allowUnstable: true if the block is not " +
          "published to the stable channel, or registryUrl if it lives in another registry.",
      );
    }
  } else {
    blockPackSpec = spec;
  }

  try {
    const blockId = await deps.project.addBlock(
      label,
      blockPackSpec,
      before,
      deps.author,
      undefined,
      {
        init: params === undefined ? undefined : { params, blockIds },
        requireModelAPIVersion: BLOCK_STORAGE_FACADE_VERSION,
      },
    );
    return textResult({ blockId });
  } catch (e: unknown) {
    if (e instanceof ModelAPIVersionMismatchError)
      return errorResult(
        "This block is built on the legacy block API, which MCP does not support. " +
          "Nothing was created.",
        "Use a newer version of the block.",
      );
    if (e instanceof BlockInitParamsRejectedError)
      return errorResult(
        `The block did not accept the params: ${e.reason}. Nothing was created.`,
        "Fix the params and call add_block again. get_block_params on a configured block " +
          "of the same kind shows the expected shape.",
      );
    throw e;
  }
}

export function registerBlockTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "add_block",
    {
      description:
        "Add a block to an opened project, optionally configured from initialization params.\n\n" +
        "`spec` names the block: `kind` (a block kind reference, resolved to the newest block " +
        "implementing it), `from-registry-v2` (an exact published block) or `dev-v2` (a local dev " +
        "block folder).\n\n" +
        "`params` are the initialization params of the block's kind: the block's own model checks " +
        "them and builds its initial state from them. Without `params` the block starts in its " +
        "default state. get_block_params shows the params of an existing block.\n\n" +
        "References to other blocks inside `params` must hold real block ids of this project, " +
        "copied from tool results. Params copied from another project or a template hold other " +
        "ids: map each of them to a block of this project with `blockIds`.\n\n" +
        "Only blocks on the current block API can be added. On any error nothing is created.",
      inputSchema: addBlockInput,
    },
    async (input) => {
      const ml = ctx.requireMl();
      return await addBlock(
        {
          project: await ctx.getOpenedProject(input.projectId),
          resolveKind: (kind, registryUrl, allowUnstable) =>
            ml.blockRegistryProvider
              .getRegistry(registryUrl ?? centralBlockRegistryUrl())
              .resolveKind(kind, { allowUnstable }),
          author: ctx.getAuthorMarker(),
        },
        input,
      );
    },
  );

  server.registerTool(
    "update_block",
    {
      description:
        "Update an existing block's pack (reload from registry or dev folder). Use after rebuilding a dev block to pick up changes without removing/re-adding it.",
      inputSchema: {
        projectId: z.string().describe("Project ID (must be opened)"),
        blockId: z.string().describe("Block ID to update"),
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
        resetArgs: z
          .boolean()
          .optional()
          .describe("Reset block arguments to initial values (default: false)"),
      },
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
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID to remove"),
      },
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
      description: "Reorder blocks in a project. Must provide ALL block IDs in the desired order.",
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockIds: z.array(z.string()).describe("All block IDs in the desired order"),
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
      inputSchema: {
        registryUrl: z.string().describe("Registry URL (from list_available_blocks)"),
        organization: z.string().describe("Organization name"),
        name: z.string().describe("Block package name"),
        version: z.string().describe("Block version"),
      },
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
      inputSchema: {
        projectId: z.string().describe("Project ID"),
        blockId: z.string().describe("Block ID to display"),
      },
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
