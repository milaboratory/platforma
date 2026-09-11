import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiddleLayer } from "@milaboratories/pl-middle-layer";
import type { ToolContext } from "./types";
import { registerConnectionTools } from "./connection";

type Handler = (args: unknown) => Promise<{
  isError?: boolean;
  content: { type: string; text: string }[];
}>;

function captureTools(ctx: Partial<ToolContext>): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => handlers.set(name, handler),
  } as unknown as McpServer;
  registerConnectionTools(server, {
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

async function callStatus(ctx: Partial<ToolContext>) {
  const handler = captureTools(ctx).get("get_connection_status");
  if (!handler) throw new Error("get_connection_status was not registered");
  return handler({});
}

describe("get_connection_status", () => {
  it("errors when the callback is absent even though a backend handle exists", async () => {
    const result = await callStatus({ getMl: () => ({}) as MiddleLayer, callbacks: {} });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("connected");
  });

  it("errors the same way when no backend handle exists", async () => {
    const withHandle = await callStatus({ getMl: () => ({}) as MiddleLayer, callbacks: {} });
    const withoutHandle = await callStatus({ getMl: () => null, callbacks: {} });
    expect(withoutHandle.isError).toBe(true);
    expect(withoutHandle.content[0].text).toBe(withHandle.content[0].text);
  });

  it("names connection status and carries its sibling's hint", async () => {
    const result = await callStatus({ callbacks: {} });
    const text = result.content[0].text;
    expect(text).toMatch(/[Cc]onnection status is not available/);
    expect(text).toContain("The desktop app integration may not support this feature.");
  });

  it("passes the callback's result through unchanged when it is present", async () => {
    const status = { connected: true, addr: "http://127.0.0.1:6345", login: "default" };
    const result = await callStatus({
      callbacks: { getConnectionStatus: async () => status },
    });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual(status);
    expect(result.content[0].text).not.toMatch(/not available/);
  });
});
