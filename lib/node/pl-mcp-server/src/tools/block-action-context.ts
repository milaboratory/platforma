import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BlockActionContextNode } from "@milaboratories/pl-middle-layer";
import { z } from "zod";
import type { ToolContext } from "./types";
import { errorResult, textResult } from "./types";

/** An action context tree node as the tool returns it: cut to the requested depth and history. */
export type LimitedBlockActionContextNode = Omit<BlockActionContextNode, "children"> & {
  children: LimitedBlockActionContextNode[];
  /** Older transitions left out of this node. */
  transitionsOmitted?: number;
  /** Child renders left out below the depth limit. Request this node by contextId to see them. */
  childrenOmitted?: number;
};

/** Options of {@link limitBlockActionContextTree}. */
export type BlockActionContextTreeLimits = {
  /** Levels of children to include under the returned node. 0 returns the node only. */
  maxDepth: number;
  /** The latest transitions to keep per node. */
  maxTransitions: number;
};

/** Finds the node with the context ID in the tree, or undefined. */
export function findBlockActionContextNode(
  tree: BlockActionContextNode,
  contextId: string,
): BlockActionContextNode | undefined {
  if (tree.contextId === contextId) return tree;
  for (const child of tree.children) {
    const found = findBlockActionContextNode(child, contextId);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Cuts an action context tree to maxDepth levels of children and the latest maxTransitions per node. */
export function limitBlockActionContextTree(
  node: BlockActionContextNode,
  limits: BlockActionContextTreeLimits,
): LimitedBlockActionContextNode {
  const transitionsOmitted = Math.max(0, node.transitions.length - limits.maxTransitions);
  const limited: LimitedBlockActionContextNode = {
    ...node,
    transitions: node.transitions.slice(transitionsOmitted),
    children:
      limits.maxDepth > 0
        ? node.children.map((child) =>
            limitBlockActionContextTree(child, { ...limits, maxDepth: limits.maxDepth - 1 }),
          )
        : [],
  };
  if (transitionsOmitted > 0) limited.transitionsOmitted = transitionsOmitted;
  if (limits.maxDepth <= 0 && node.children.length > 0)
    limited.childrenOmitted = node.children.length;
  return limited;
}

export function registerBlockActionContextTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "get_block_action_context",
    {
      description:
        "Get the block action context tree of a block run: one node per template render, each with its baggage " +
        "(name, block-pack, block-id, run-id, resource, root), its action transition in time order " +
        "(namespace, reporting resource, state, detail, reason), its readings (namespace, resource, key, " +
        "value) and its child renders. Use it to see which step a block is in or where it waits. " +
        "The result is cut to maxDepth levels and the latest maxTransitions per node; a node with " +
        "childrenOmitted or transitionsOmitted has more. Pass its contextId to read below it. " +
        "Reads the current state; call again to refresh.",
      inputSchema: {
        projectId: z.string().describe("Project ID (must be opened)"),
        blockId: z.string().describe("Block ID"),
        mode: z
          .enum(["prod", "staging"])
          .optional()
          .describe("Which render of the block: 'prod' (default) or 'staging'"),
        contextId: z
          .string()
          .optional()
          .describe("Return the subtree of this action context instead of the root"),
        maxDepth: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(3)
          .describe("Levels of child renders to include (default 3)"),
        maxTransitions: z
          .number()
          .int()
          .min(0)
          .optional()
          .default(20)
          .describe("Latest transitions to include per node (default 20)"),
      },
    },
    async ({ projectId, blockId, mode, contextId, maxDepth, maxTransitions }) => {
      const project = await ctx.getOpenedProject(projectId);
      const tree = await project.getBlockActionContext(blockId, mode ?? "prod");
      if (tree === undefined)
        return errorResult(
          "Block has no action context tree: it was not rendered yet, or the backend does not support block action context.",
        );

      const node = contextId === undefined ? tree : findBlockActionContextNode(tree, contextId);
      if (node === undefined)
        return errorResult(
          `Action context ${contextId} is not in the action context tree of the block. Call without contextId to see the tree.`,
        );

      return textResult(limitBlockActionContextTree(node, { maxDepth, maxTransitions }));
    },
  );
}
