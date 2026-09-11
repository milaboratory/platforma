import { test, expect } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { withMcpServer } from "./with-mcp";
import path from "node:path";

const FOREVER = "(() => { while (true) {} })()";
const OVER_MEMORY_LIMIT =
  "(() => { const a = []; while (true) a.push(new Array(1e6).fill(0)); })()";

const enterNumbersBlockFolder = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "etc",
  "blocks",
  "enter-numbers",
  "block",
);

function parseResult(result: unknown): unknown {
  const r = result as { content?: { type: string; text: string }[] };
  if (!r.content?.[0]) throw new Error("No content in result");
  return JSON.parse(r.content[0].text);
}

/** One block's entry out of a batch read: `{ ok: false, error, hint }` or `{ ok: true, value }`. */
function entryFor(result: unknown, blockId: string) {
  const r = result as { isError?: boolean; content?: { type: string; text: string }[] };
  expect(r.isError).not.toBe(true);
  const entries = JSON.parse(r.content?.[0]?.text ?? "{}") as Record<
    string,
    { ok: boolean; value?: unknown; error?: string; hint?: string }
  >;
  return entries[blockId];
}

async function projectWithBlock(client: Client) {
  const { projectId } = parseResult(
    await client.callTool({ name: "create_project", arguments: { label: "Sandbox Test" } }),
  ) as { projectId: string };
  await client.callTool({ name: "open_project", arguments: { projectId } });
  const { blockId } = parseResult(
    await client.callTool({
      name: "add_block",
      arguments: {
        projectId,
        label: "Enter Numbers",
        spec: { type: "dev-v2", folder: enterNumbersBlockFolder },
      },
    }),
  ) as { blockId: string };
  return { projectId, blockId };
}

test(
  "two transforms in flight at once each hit their own deadline",
  { timeout: 60_000 },
  async () => {
    await withMcpServer(async ({ client }) => {
      const { projectId, blockId } = await projectWithBlock(client);

      const [first, second] = await Promise.all([
        client.callTool({
          name: "get_block_state",
          arguments: { projectId, blockIds: [blockId], transform: FOREVER, transformTimeout: 500 },
        }),
        client.callTool({
          name: "get_block_state",
          arguments: { projectId, blockIds: [blockId], transform: FOREVER, transformTimeout: 500 },
        }),
      ]);

      for (const result of [first, second]) {
        const entry = entryFor(result, blockId);
        expect(entry.ok).toBe(false);
        expect(entry.error).toMatch(/transform/i);
        expect(entry.hint).toBeTruthy();
      }

      await client.callTool({ name: "close_project", arguments: { projectId } });
      await client.callTool({ name: "delete_project", arguments: { projectId } });
    });
  },
);

test("a failed transform does not spoil the next one", { timeout: 60_000 }, async () => {
  await withMcpServer(async ({ client }) => {
    const { projectId, blockId } = await projectWithBlock(client);

    const failed = await client.callTool({
      name: "get_block_state",
      arguments: { projectId, blockIds: [blockId], transform: FOREVER, transformTimeout: 500 },
    });
    expect(entryFor(failed, blockId).error).toMatch(/transform/i);

    const next = await client.callTool({
      name: "get_block_state",
      arguments: { projectId, blockIds: [blockId], transform: "1 + 1", transformTimeout: 5000 },
    });
    expect(entryFor(next, blockId)).toEqual({ ok: true, value: 2 });

    await client.callTool({ name: "close_project", arguments: { projectId } });
    await client.callTool({ name: "delete_project", arguments: { projectId } });
  });
});

test(
  "a transform past the memory limit leaves the server serving",
  { timeout: 60_000 },
  async () => {
    await withMcpServer(async ({ client }) => {
      const { projectId, blockId } = await projectWithBlock(client);

      const failed = await client.callTool({
        name: "get_block_state",
        arguments: {
          projectId,
          blockIds: [blockId],
          transform: OVER_MEMORY_LIMIT,
          transformTimeout: 10_000,
        },
      });
      expect(entryFor(failed, blockId).error).toMatch(/transform/i);

      const ping = parseResult(await client.callTool({ name: "ping", arguments: {} }));
      expect(ping).toEqual({ status: "ok", connected: true });

      await client.callTool({ name: "close_project", arguments: { projectId } });
      await client.callTool({ name: "delete_project", arguments: { projectId } });
    });
  },
);
