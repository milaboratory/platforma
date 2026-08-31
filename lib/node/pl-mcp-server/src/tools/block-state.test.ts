import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Project } from "@milaboratories/pl-middle-layer";
import type { ToolContext } from "./types";
import { registerBlockStateTools } from "./block-state";

type Handler = (args: unknown) => Promise<{
  isError?: boolean;
  content: { type: string; text: string }[];
}>;

function captureTools(ctx: Partial<ToolContext>): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
  } as unknown as McpServer;
  registerBlockStateTools(server, {
    getMl: () => null,
    requireMl: () => {
      throw new Error("not connected");
    },
    resolveProject: async () => {
      throw new Error("unused");
    },
    getOpenedProject: async () => {
      throw new Error("unused");
    },
    callbacks: {},
    getAuthorMarker: () => ({ authorId: "test", localVersion: 1 }),
    ...ctx,
  } as ToolContext);
  return handlers;
}

async function callGetBlockState(project: Partial<Project>) {
  const handler = captureTools({ getOpenedProject: async () => project as Project }).get(
    "get_block_state",
  );
  if (!handler) throw new Error("get_block_state was not registered");
  return handler({ projectId: "p1", blockIds: ["b1"] });
}

describe("get_block_state", () => {
  it("fails only that block's entry when its state has not resolved yet", async () => {
    const result = await callGetBlockState({
      getBlockState: () => ({ getValue: async () => undefined }) as never,
    });

    expect(result.isError).not.toBe(true);
    const entries = JSON.parse(result.content[0].text) as Record<
      string,
      { ok: boolean; error?: string; hint?: string }
    >;
    expect(entries.b1.ok).toBe(false);
    expect(entries.b1.error).toMatch(/not available yet/);
    expect(entries.b1.hint).toMatch(/calculationStatus/);
  });
});
